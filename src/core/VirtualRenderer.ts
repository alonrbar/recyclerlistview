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

    private _scrollOnNextUpdate: (point: Point) => void;
    /**
     * Keeps track of keys of all the currently rendered indexes, can eventually
     * replace renderStack as well if no new use cases come up
     */
    private _stableIdToRenderKeyMap: { [key: string]: StableIdMapItem };
    private _engagedIndexes: { [key: number]: number };
    /**
     * Keeps track of items that need to be rendered in the next render cycle
     */
    private itemsToRender: ItemsToRender;
    private onRenderItems: (itemsToRender: ItemsToRender) => void;
    private _isRecyclingEnabled: boolean;
    private _isViewTrackerRunning: boolean;
    private _markDirty: boolean;
    private _startKey: number;
    private _recyclePool: RecycleItemPool = TSCast.cast<RecycleItemPool>(null); //TSI
    private _params: RenderStackParams | null;
    private _layoutManager: LayoutManager | null = null;
    private _viewabilityTracker: ViewabilityTracker | null = null;
    private _dimensions: Dimension | null;

    constructor(
        onRenderItems: (itemsToRender: ItemsToRender) => void,
        scrollOnNextUpdate: (point: Point) => void,
        isRecyclingEnabled: boolean
    ) {
        
        this.onRenderItems = onRenderItems;
        this._scrollOnNextUpdate = scrollOnNextUpdate;
        this.itemsToRender = {};

        this._stableIdToRenderKeyMap = {};
        this._engagedIndexes = {};
        this._dimensions = null;
        this._params = null;
        this._isRecyclingEnabled = isRecyclingEnabled;

        this._isViewTrackerRunning = false;
        this._markDirty = false;

        // Would be surprised if someone exceeds this
        this._startKey = 0;
    }

    //
    // public methods
    //

    public init(): void {
        this.getInitialOffset();
        this._recyclePool = new RecycleItemPool();
        if (this._params) {
            this._viewabilityTracker = new ViewabilityTracker(
                (this._params.renderAheadOffset || 0),
                (this._params.initialOffset || 0));
        } else {
            this._viewabilityTracker = new ViewabilityTracker(0, 0);
        }
        this._prepareViewabilityTracker();
    }

    public getContentDimension(): Dimension {
        if (this._layoutManager) {
            return this._layoutManager.getContentDimension();
        }
        return { height: 0, width: 0 };
    }

    public updateOffset(offsetX: number, offsetY: number, correction: number, isActual: boolean): void {
        if (this._viewabilityTracker) {
            const offset = this._params && this._params.isHorizontal ? offsetX : offsetY;
            if (!this._isViewTrackerRunning) {
                if (isActual) {
                    this._viewabilityTracker.setActualOffset(offset);
                }
                this.startViewabilityTracker();
            }
            this._viewabilityTracker.updateOffset(offset, correction, isActual);
        }
    }

    public getLayoutManager(): LayoutManager | null {
        return this._layoutManager;
    }

    public setParamsAndDimensions(params: RenderStackParams, dim: Dimension): void {
        this._params = params;
        this._dimensions = dim;
    }

    public setLayoutManager(layoutManager: LayoutManager): void {
        this._layoutManager = layoutManager;
        if (this._params) {
            this._layoutManager.relayoutFromIndex(0, this._params.itemCount);
        }
    }

    public getViewabilityTracker(): ViewabilityTracker | null {
        return this._viewabilityTracker;
    }

    public refreshWithAnchor(): void {
        if (this._viewabilityTracker) {
            let firstVisibleIndex = this._viewabilityTracker.findFirstLogicallyVisibleIndex();
            this._prepareViewabilityTracker();
            let offset = 0;
            if (this._layoutManager && this._params) {
                firstVisibleIndex = Math.min(this._params.itemCount - 1, firstVisibleIndex);
                const point = this._layoutManager.getOffsetForIndex(firstVisibleIndex);
                this._scrollOnNextUpdate(point);
                offset = this._params.isHorizontal ? point.x : point.y;
            }
            this._viewabilityTracker.forceRefreshWithOffset(offset);
        }
    }

    public refresh(): void {
        if (this._viewabilityTracker) {
            this._prepareViewabilityTracker();
            if (this._viewabilityTracker.forceRefresh()) {
                if (this._params && this._params.isHorizontal) {
                    this._scrollOnNextUpdate({ x: this._viewabilityTracker.getLastActualOffset(), y: 0 });
                } else {
                    this._scrollOnNextUpdate({ x: 0, y: this._viewabilityTracker.getLastActualOffset() });
                }
            }
        }
    }

    public getInitialOffset(): Point {
        let offset = { x: 0, y: 0 };
        if (this._params) {
            const initialRenderIndex = (this._params.initialRenderIndex || 0);
            if (initialRenderIndex > 0 && this._layoutManager) {
                offset = this._layoutManager.getOffsetForIndex(initialRenderIndex);
                this._params.initialOffset = this._params.isHorizontal ? offset.x : offset.y;
            } else {
                if (this._params.isHorizontal) {
                    offset.x = (this._params.initialOffset || 0);
                    offset.y = 0;
                } else {
                    offset.y = (this._params.initialOffset || 0);
                    offset.x = 0;
                }
            }
        }
        return offset;
    }

    public startViewabilityTracker(): void {
        if (this._viewabilityTracker) {
            this._isViewTrackerRunning = true;
            this._viewabilityTracker.init();
        }
    }

    public syncAndGetKey(rowIndex: number): React.Key {
        const stableIdItem = this._stableIdToRenderKeyMap[rowIndex];
        let key: React.Key = stableIdItem ? stableIdItem.key : undefined;

        if (isNullOrUndefined(key)) {
            key = this._recyclePool.getNext();
            if (!isNullOrUndefined(key)) {
                const oldIndex = this.itemsToRender[key];
                if (oldIndex !== null && oldIndex !== undefined) {
                    this.itemsToRender[key] = rowIndex;
                    if (!isNullOrUndefined(oldIndex) && oldIndex !== rowIndex) {
                        delete this._stableIdToRenderKeyMap[oldIndex];
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
            this._markDirty = true;
            this._stableIdToRenderKeyMap[rowIndex] = { key };
        }
        if (!isNullOrUndefined(this._engagedIndexes[rowIndex])) {
            this._recyclePool.remove(key);
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
        return "#" + this._startKey++ + "_rlv_c";
    }

    private _prepareViewabilityTracker(): void {
        if (this._viewabilityTracker && this._layoutManager && this._dimensions && this._params) {
            this._viewabilityTracker.onEngagedRowsChanged = this._onEngagedItemsChanged;
            this._viewabilityTracker.setLayouts(this._layoutManager.getLayouts(), this._params.isHorizontal ?
                this._layoutManager.getContentDimension().width :
                this._layoutManager.getContentDimension().height);
            this._viewabilityTracker.setDimensions({
                height: this._dimensions.height,
                width: this._dimensions.width,
            }, this._params.isHorizontal);
        } else {
            throw new CustomError(RecyclerListViewExceptions.initializationException);
        }
    }

    private _onEngagedItemsChanged = (all: number[], now: number[], notNow: number[]): void => {
        const count = notNow.length;
        let resolvedKey;
        let disengagedIndex = 0;
        if (this._isRecyclingEnabled) {
            for (let i = 0; i < count; i++) {
                disengagedIndex = notNow[i];
                delete this._engagedIndexes[disengagedIndex];
                if (this._params && disengagedIndex < this._params.itemCount) {
                    // All the items which are now not visible can go to the
                    // recycle pool, the pool only needs to maintain keys since
                    // react can link a view to a key automatically
                    resolvedKey = this._stableIdToRenderKeyMap[disengagedIndex];
                    if (!isNullOrUndefined(resolvedKey)) {
                        this._recyclePool.add(resolvedKey.key);
                    }
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
        this._markDirty = false;
        const count = itemIndexes.length;
        let index = 0;
        let hasRenderStackChanged = false;
        for (let i = 0; i < count; i++) {
            index = itemIndexes[i];
            this._engagedIndexes[index] = 1;
            this.syncAndGetKey(index);
            hasRenderStackChanged = this._markDirty;
        }
        this._markDirty = false;
        return hasRenderStackChanged;
    }
}
