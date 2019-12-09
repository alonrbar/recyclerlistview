import { isNullOrUndefined } from '../utils';
import RecycleItemPool from '../utils/RecycleItemPool';
import TSCast from '../utils/TSCast';
import CustomError from './exceptions/CustomError';
import RecyclerListViewExceptions from './exceptions/RecyclerListViewExceptions';
import { LayoutManager, Point } from './LayoutManager';
import { Dimension } from './LayoutProvider';
import { ViewabilityTracker } from './ViewabilityTracker';

export interface StableIdMapItem {
    key: React.Key;
}
export interface ItemsToRender { [key: string]: number; }

export interface RenderStackParams {
    isHorizontal?: boolean;
    itemCount: number;
    initialOffset?: number;
    initialRenderIndex?: number;
    renderAheadOffset?: number;
}

/**
 * Renderer which keeps track of recyclable items and the currently rendered
 * items. Notifies list view to re-render if something changes, like scroll
 * offset
 */
export class VirtualRenderer {

    private scrollOnNextUpdate: (point: Point) => void;
    /**
     * Keeps track of keys of all the currently rendered indexes, can eventually
     * replace renderStack as well if no new use cases come up
     */
    private stableIdToRenderKeyMap: { [key: string]: StableIdMapItem } = {};
    private engagedIndexes: { [key: number]: number } = {};
    /**
     * Keeps track of items that need to be rendered in the next render cycle
     */
    private itemsToRender: ItemsToRender = {};
    private onRenderItems: (itemsToRender: ItemsToRender) => void;
    private isViewTrackerRunning = false;
    private markDirty = false;
    /**
     * Would be surprised if someone exceeds this
     */
    private startKey = 0;
    private recyclePool: RecycleItemPool = TSCast.cast<RecycleItemPool>(null); //TSI
    private params: RenderStackParams | null = null;
    private layoutManager: LayoutManager | null = null;
    private viewabilityTracker: ViewabilityTracker | null = null;
    private dimensions: Dimension | null = null;

    constructor(
        onRenderItems: (itemsToRender: ItemsToRender) => void,
        scrollOnNextUpdate: (point: Point) => void
    ) {

        this.onRenderItems = onRenderItems;
        this.scrollOnNextUpdate = scrollOnNextUpdate;
    }

    //
    // public methods
    //

    public init(): void {
        this.getInitialOffset();
        this.recyclePool = new RecycleItemPool();
        if (this.params) {
            this.viewabilityTracker = new ViewabilityTracker(
                (this.params.renderAheadOffset || 0),
                (this.params.initialOffset || 0));
        } else {
            this.viewabilityTracker = new ViewabilityTracker(0, 0);
        }
        this._prepareViewabilityTracker();
    }

    public getContentDimension(): Dimension {
        if (this.layoutManager) {
            return this.layoutManager.getContentDimension();
        }
        return { height: 0, width: 0 };
    }

    public updateOffset(offsetX: number, offsetY: number, correction: number, isActual: boolean): void {
        if (!this.viewabilityTracker)
            return;

        const offset = this.params && this.params.isHorizontal ? offsetX : offsetY;
        if (!this.isViewTrackerRunning) {
            if (isActual) {
                this.viewabilityTracker.setActualOffset(offset);
            }
            this.startViewabilityTracker();
        }
        this.viewabilityTracker.updateOffset(offset, correction, isActual);
    }

    public getLayoutManager(): LayoutManager | null {
        return this.layoutManager;
    }

    public setParamsAndDimensions(params: RenderStackParams, dim: Dimension): void {
        this.params = params;
        this.dimensions = dim;
    }

    public setLayoutManager(layoutManager: LayoutManager): void {
        this.layoutManager = layoutManager;
        if (this.params) {
            this.layoutManager.relayoutFromIndex(0, this.params.itemCount);
        }
    }

    public getViewabilityTracker(): ViewabilityTracker | null {
        return this.viewabilityTracker;
    }

    public refreshWithAnchor(): void {
        if (this.viewabilityTracker) {
            let firstVisibleIndex = this.viewabilityTracker.findFirstLogicallyVisibleIndex();
            this._prepareViewabilityTracker();
            let offset = 0;
            if (this.layoutManager && this.params) {
                firstVisibleIndex = Math.min(this.params.itemCount - 1, firstVisibleIndex);
                const point = this.layoutManager.getOffsetForIndex(firstVisibleIndex);
                this.scrollOnNextUpdate(point);
                offset = this.params.isHorizontal ? point.x : point.y;
            }
            this.viewabilityTracker.forceRefreshWithOffset(offset);
        }
    }

    public refresh(): void {
        if (this.viewabilityTracker) {
            this._prepareViewabilityTracker();
            if (this.viewabilityTracker.forceRefresh()) {
                if (this.params && this.params.isHorizontal) {
                    this.scrollOnNextUpdate({ x: this.viewabilityTracker.getLastActualOffset(), y: 0 });
                } else {
                    this.scrollOnNextUpdate({ x: 0, y: this.viewabilityTracker.getLastActualOffset() });
                }
            }
        }
    }

    public getInitialOffset(): Point {
        let offset = { x: 0, y: 0 };
        if (this.params) {
            const initialRenderIndex = (this.params.initialRenderIndex || 0);
            if (initialRenderIndex > 0 && this.layoutManager) {
                offset = this.layoutManager.getOffsetForIndex(initialRenderIndex);
                this.params.initialOffset = this.params.isHorizontal ? offset.x : offset.y;
            } else {
                if (this.params.isHorizontal) {
                    offset.x = (this.params.initialOffset || 0);
                    offset.y = 0;
                } else {
                    offset.y = (this.params.initialOffset || 0);
                    offset.x = 0;
                }
            }
        }
        return offset;
    }

    public startViewabilityTracker(): void {
        if (this.viewabilityTracker) {
            this.isViewTrackerRunning = true;
            this.viewabilityTracker.init();
        }
    }

    public syncAndGetKey(rowIndex: number): React.Key {
        const stableIdItem = this.stableIdToRenderKeyMap[rowIndex];
        let key: React.Key = stableIdItem ? stableIdItem.key : undefined;

        if (isNullOrUndefined(key)) {
            key = this.recyclePool.getNext();
            if (!isNullOrUndefined(key)) {
                const oldIndex = this.itemsToRender[key];
                if (oldIndex !== null && oldIndex !== undefined) {
                    this.itemsToRender[key] = rowIndex;
                    if (!isNullOrUndefined(oldIndex) && oldIndex !== rowIndex) {
                        delete this.stableIdToRenderKeyMap[oldIndex];
                    }
                } else {
                    this.itemsToRender[key] = rowIndex;
                }
            } else {
                key = rowIndex;
                if (this.itemsToRender[key]) {
                    //Probable collision, warn and avoid
                    //TODO: Disabled incorrectly triggering in some cases
                    //console.warn("Possible stableId collision @", index); //tslint:disable-line
                    key = this._getCollisionAvoidingKey();
                }
                this.itemsToRender[key] = rowIndex;
            }
            this.markDirty = true;
            this.stableIdToRenderKeyMap[rowIndex] = { key };
        }
        if (!isNullOrUndefined(this.engagedIndexes[rowIndex])) {
            this.recyclePool.remove(key);
        }
        const indexToCompare = this.itemsToRender[key];
        if (indexToCompare !== undefined && indexToCompare !== rowIndex) {
            // Probable collision, warn
            console.warn("Possible stableId collision @", rowIndex); //tslint:disable-line
        }
        return key;
    }

    //
    // private methods
    //

    private _getCollisionAvoidingKey(): string {
        return "#" + this.startKey++ + "_rlv_c";
    }

    private _prepareViewabilityTracker(): void {
        if (this.viewabilityTracker && this.layoutManager && this.dimensions && this.params) {
            this.viewabilityTracker.onEngagedRowsChanged = this._onEngagedItemsChanged;
            this.viewabilityTracker.setLayouts(this.layoutManager.getLayouts(), this.params.isHorizontal ?
                this.layoutManager.getContentDimension().width :
                this.layoutManager.getContentDimension().height);
            this.viewabilityTracker.setDimensions({
                height: this.dimensions.height,
                width: this.dimensions.width,
            }, this.params.isHorizontal);
        } else {
            throw new CustomError(RecyclerListViewExceptions.initializationException);
        }
    }

    private _onEngagedItemsChanged = (all: number[], now: number[], notNow: number[]): void => {
        const count = notNow.length;
        let resolvedKey;
        let disengagedIndex = 0;
        for (let i = 0; i < count; i++) {
            disengagedIndex = notNow[i];
            delete this.engagedIndexes[disengagedIndex];
            if (this.params && disengagedIndex < this.params.itemCount) {
                // All the items which are now not visible can go to the
                // recycle pool, the pool only needs to maintain keys since
                // react can link a view to a key automatically
                resolvedKey = this.stableIdToRenderKeyMap[disengagedIndex];
                if (!isNullOrUndefined(resolvedKey)) {
                    this.recyclePool.add(resolvedKey.key);
                }
            }
        }
        if (this._updateRenderStack(now)) {
            // Ask Recycler View to update itself
            this.onRenderItems(this.itemsToRender);
        }
    }

    /**
     * Updates render stack and reports whether anything has changed
     */
    private _updateRenderStack(itemIndexes: number[]): boolean {
        this.markDirty = false;
        const count = itemIndexes.length;
        let index = 0;
        let hasRenderStackChanged = false;
        for (let i = 0; i < count; i++) {
            index = itemIndexes[i];
            this.engagedIndexes[index] = 1;
            this.syncAndGetKey(index);
            hasRenderStackChanged = this.markDirty;
        }
        this.markDirty = false;
        return hasRenderStackChanged;
    }
}
