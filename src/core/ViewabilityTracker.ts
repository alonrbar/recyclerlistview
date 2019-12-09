import BinarySearch from "../utils/BinarySearch";
import { Dimension } from "./LayoutProvider";
import { Layout } from "./LayoutManager";

export interface Range {
    start: number;
    end: number;
}

export type TOnItemStatusChanged = ((all: number[], now: number[], notNow: number[]) => void);

/***
 * Given an offset this utility can compute visible items. Also tracks
 * previously visible items to compute items which get hidden or visible Virtual
 * renderer uses callbacks from this utility to main recycle pool and the render
 * stack. The utility optimizes finding visible indexes by using the last
 * visible items. However, that can be slow if scrollToOffset is explicitly
 * called. We use binary search to optimize in most cases like while finding
 * first visible item or initial offset. In future we'll also be using BS to
 * speed up scroll to offset.
 */
export class ViewabilityTracker {
    public onEngagedRowsChanged: TOnItemStatusChanged | null;

    private currentOffset: number;
    private maxOffset: number;
    private renderAheadOffset: number;
    private visibleWindow: Range;
    private engagedWindow: Range;
    private relevantDim: Range;
    private isHorizontal: boolean;
    private windowBound: number;
    private visibleIndexes: number[];
    private engagedIndexes: number[];
    private layouts: Layout[] = [];
    private actualOffset: number;

    constructor(renderAheadOffset: number, initialOffset: number) {
        this.currentOffset = Math.max(0, initialOffset);
        this.maxOffset = 0;
        this.actualOffset = 0;
        this.renderAheadOffset = renderAheadOffset;
        this.visibleWindow = { start: 0, end: 0 };
        this.engagedWindow = { start: 0, end: 0 };

        this.isHorizontal = false;
        this.windowBound = 0;

        this.visibleIndexes = [];  //needs to be sorted
        this.engagedIndexes = [];  //needs to be sorted

        this.onEngagedRowsChanged = null;

        this.relevantDim = { start: 0, end: 0 };
    }

    public init(): void {
        this._doInitialFit(this.currentOffset);
    }

    public setLayouts(layouts: Layout[], maxOffset: number): void {
        this.layouts = layouts;
        this.maxOffset = maxOffset;
    }

    public setDimensions(dimension: Dimension, isHorizontal: boolean): void {
        this.isHorizontal = isHorizontal;
        this.windowBound = isHorizontal ? dimension.width : dimension.height;
    }

    public forceRefresh(): boolean {
        const shouldForceScroll = this.currentOffset >= (this.maxOffset - this.windowBound);
        this.forceRefreshWithOffset(this.currentOffset);
        return shouldForceScroll;
    }

    public forceRefreshWithOffset(offset: number): void {
        this.currentOffset = -1;
        this.updateOffset(offset, 0, false);
    }

    public updateOffset(offset: number, correction: number, isActual: boolean): void {
        if (isActual) {
            this.actualOffset = offset;
        }
        offset = Math.min(this.maxOffset, Math.max(0, offset + correction));
        if (this.currentOffset !== offset) {
            this.currentOffset = offset;
            this._updateTrackingWindows(offset);
            let startIndex = 0;
            if (this.visibleIndexes.length > 0) {
                startIndex = this.visibleIndexes[0];
            }
            this._fitAndUpdate(startIndex);
        }
    }

    public getLastActualOffset(): number {
        return this.actualOffset;
    }

    public findFirstLogicallyVisibleIndex(): number {
        const relevantIndex = this._findFirstVisibleIndexUsingBS(0.001);
        let result = relevantIndex;
        for (let i = relevantIndex - 1; i >= 0; i--) {
            if (this.isHorizontal) {
                if (this.layouts[relevantIndex].x !== this.layouts[i].x) {
                    break;
                } else {
                    result = i;
                }
            } else {
                if (this.layouts[relevantIndex].y !== this.layouts[i].y) {
                    break;
                } else {
                    result = i;
                }
            }
        }
        return result;
    }

    public updateRenderAheadOffset(renderAheadOffset: number): void {
        this.renderAheadOffset = Math.max(0, renderAheadOffset);
        this.forceRefreshWithOffset(this.currentOffset);
    }

    public getCurrentRenderAheadOffset(): number {
        return this.renderAheadOffset;
    }
    public setActualOffset(actualOffset: number): void {
        this.actualOffset = actualOffset;
    }

    private _findFirstVisibleIndexOptimally(): number {
        let firstVisibleIndex = 0;

        //TODO: Talha calculate this value smartly
        if (this.currentOffset > 5000) {
            firstVisibleIndex = this._findFirstVisibleIndexUsingBS();
        } else if (this.currentOffset > 0) {
            firstVisibleIndex = this._findFirstVisibleIndexLinearly();
        }
        return firstVisibleIndex;
    }

    private _fitAndUpdate(startIndex: number): void {
        const newVisibleItems: number[] = [];
        const newEngagedItems: number[] = [];
        this._fitIndexes(newVisibleItems, newEngagedItems, startIndex, true);
        this._fitIndexes(newVisibleItems, newEngagedItems, startIndex + 1, false);
        this._diffUpdateOriginalIndexesAndRaiseEvents(newVisibleItems, newEngagedItems);
    }

    private _doInitialFit(offset: number): void {
        offset = Math.min(this.maxOffset, Math.max(0, offset));
        this._updateTrackingWindows(offset);
        const firstVisibleIndex = this._findFirstVisibleIndexOptimally();
        this._fitAndUpdate(firstVisibleIndex);
    }

    //TODO:Talha switch to binary search and remove atleast once logic in _fitIndexes
    private _findFirstVisibleIndexLinearly(): number {
        const count = this.layouts.length;
        let itemRect = null;
        const relevantDim = { start: 0, end: 0 };

        for (let i = 0; i < count; i++) {
            itemRect = this.layouts[i];
            this._setRelevantBounds(itemRect, relevantDim);
            if (this._itemIntersectsVisibleWindow(relevantDim.start, relevantDim.end)) {
                return i;
            }
        }
        return 0;
    }

    private _findFirstVisibleIndexUsingBS(bias = 0): number {
        const count = this.layouts.length;
        return BinarySearch.findClosestHigherValueIndex(count, this.visibleWindow.start + bias, this._valueExtractorForBinarySearch);
    }

    private _valueExtractorForBinarySearch = (index: number): number => {
        const itemRect = this.layouts[index];
        this._setRelevantBounds(itemRect, this.relevantDim);
        return this.relevantDim.end;
    }

    //TODO:Talha Optimize further in later revisions, alteast once logic can be replace with a BS lookup
    private _fitIndexes(newVisibleIndexes: number[], newEngagedIndexes: number[], startIndex: number, isReverse: boolean): void {
        const count = this.layouts.length;
        const relevantDim: Range = { start: 0, end: 0 };
        let i = 0;
        let atLeastOneLocated = false;
        if (startIndex < count) {
            if (!isReverse) {
                for (i = startIndex; i < count; i++) {
                    if (this._checkIntersectionAndReport(i, false, relevantDim, newVisibleIndexes, newEngagedIndexes)) {
                        atLeastOneLocated = true;
                    } else {
                        if (atLeastOneLocated) {
                            break;
                        }
                    }
                }
            } else {
                for (i = startIndex; i >= 0; i--) {
                    if (this._checkIntersectionAndReport(i, true, relevantDim, newVisibleIndexes, newEngagedIndexes)) {
                        atLeastOneLocated = true;
                    } else {
                        if (atLeastOneLocated) {
                            break;
                        }
                    }
                }
            }
        }
    }

    private _checkIntersectionAndReport(index: number,
        insertOnTop: boolean,
        relevantDim: Range,
        newVisibleIndexes: number[],
        newEngagedIndexes: number[]): boolean {
        const itemRect = this.layouts[index];
        let isFound = false;
        this._setRelevantBounds(itemRect, relevantDim);
        if (this._itemIntersectsVisibleWindow(relevantDim.start, relevantDim.end)) {
            if (insertOnTop) {
                newVisibleIndexes.splice(0, 0, index);
                newEngagedIndexes.splice(0, 0, index);
            } else {
                newVisibleIndexes.push(index);
                newEngagedIndexes.push(index);
            }
            isFound = true;
        } else if (this._itemIntersectsEngagedWindow(relevantDim.start, relevantDim.end)) {
            //TODO: This needs to be optimized
            if (insertOnTop) {
                newEngagedIndexes.splice(0, 0, index);
            } else {
                newEngagedIndexes.push(index);

            }
            isFound = true;
        }
        return isFound;
    }

    private _setRelevantBounds(itemRect: Layout, relevantDim: Range): void {
        if (this.isHorizontal) {
            relevantDim.end = itemRect.x + itemRect.width;
            relevantDim.start = itemRect.x;
        } else {
            relevantDim.end = itemRect.y + itemRect.height;
            relevantDim.start = itemRect.y;
        }
    }

    private _isItemInBounds(window: Range, itemBound: number): boolean {
        return (window.start < itemBound && window.end > itemBound);
    }

    private _isItemBoundsBeyondWindow(window: Range, startBound: number, endBound: number): boolean {
        return (window.start >= startBound && window.end <= endBound);
    }

    private _isZeroHeightEdgeElement(window: Range, startBound: number, endBound: number): boolean {
        return startBound - endBound === 0 && (window.start === startBound || window.end === endBound);
    }

    private _itemIntersectsWindow(window: Range, startBound: number, endBound: number): boolean {
        return this._isItemInBounds(window, startBound) ||
            this._isItemInBounds(window, endBound) ||
            this._isItemBoundsBeyondWindow(window, startBound, endBound) ||
            this._isZeroHeightEdgeElement(window, startBound, endBound);
    }

    private _itemIntersectsEngagedWindow(startBound: number, endBound: number): boolean {
        return this._itemIntersectsWindow(this.engagedWindow, startBound, endBound);
    }

    private _itemIntersectsVisibleWindow(startBound: number, endBound: number): boolean {
        return this._itemIntersectsWindow(this.visibleWindow, startBound, endBound);
    }

    private _updateTrackingWindows(newOffset: number): void {
        this.engagedWindow.start = Math.max(0, newOffset - this.renderAheadOffset);
        this.engagedWindow.end = newOffset + this.windowBound + this.renderAheadOffset;

        this.visibleWindow.start = newOffset;
        this.visibleWindow.end = newOffset + this.windowBound;
    }

    //TODO:Talha optimize this
    private _diffUpdateOriginalIndexesAndRaiseEvents(newVisibleItems: number[], newEngagedItems: number[]): void {
        this._diffArraysAndCallFunc(newEngagedItems, this.engagedIndexes, this.onEngagedRowsChanged);
        this.visibleIndexes = newVisibleItems;
        this.engagedIndexes = newEngagedItems;
    }

    private _diffArraysAndCallFunc(newItems: number[], oldItems: number[], func: TOnItemStatusChanged | null): void {
        if (!func)
            return;

        const now = this._calculateArrayDiff(newItems, oldItems);
        const notNow = this._calculateArrayDiff(oldItems, newItems);
        if (now.length > 0 || notNow.length > 0) {
            func([...newItems], now, notNow);
        }
    }

    //TODO:Talha since arrays are sorted this can be much faster
    private _calculateArrayDiff(arr1: number[], arr2: number[]): number[] {
        const len = arr1.length;
        const diffArr = [];
        for (let i = 0; i < len; i++) {
            if (BinarySearch.findIndexOf(arr2, arr1[i]) === -1) {
                diffArr.push(arr1[i]);
            }
        }
        return diffArr;
    }
}
