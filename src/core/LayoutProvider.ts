import { Layout, WrapGridLayoutManager, LayoutManager } from "./LayoutManager";

export class LayoutProvider {

    /**
     * Unset if your new layout provider doesn't require firstVisibleIndex
     * preservation on application 
     */
    public shouldRefreshWithAnchoring: boolean = true;

    private _setLayout: (dim: Dimension, index: number) => void;
    private _tempDim: Dimension;
    private _lastLayoutManager: WrapGridLayoutManager | undefined;

    constructor(setLayout: (dim: Dimension, index: number) => void) {
        this._setLayout = setLayout;
        this._tempDim = { height: 0, width: 0 };
    }

    /**
     * Return your layout manager, you get all required dependencies here. Also,
     * make sure to use cachedLayouts. RLV might cache layouts and give back to
     * in cases of conxtext preservation. Make sure you use them if provided.
     */
    public newLayoutManager(renderWindowSize: Dimension, isHorizontal?: boolean, cachedLayouts?: Layout[]): LayoutManager {
        this._lastLayoutManager = new WrapGridLayoutManager(this, renderWindowSize, isHorizontal, cachedLayouts);
        return this._lastLayoutManager;
    }

    //Given a type and dimension set the dimension values on given dimension object
    //You can also get index here if you add an extra argument but we don't recommend using it.
    public setComputedLayout(dimension: Dimension, index: number): void {
        return this._setLayout(dimension, index);
    }

    /**
     * Check if given dimension contradicts with your layout provider, return
     * true for mismatches. Returning true will cause a relayout to fix the
     * discrepancy.
     */
    public checkDimensionDiscrepancy(dimension: Dimension, index: number): boolean {
        const dimension1 = dimension;
        this.setComputedLayout(this._tempDim, index);
        const dimension2 = this._tempDim;
        if (this._lastLayoutManager) {
            this._lastLayoutManager.setMaxBounds(dimension2);
        }
        return dimension1.height !== dimension2.height || dimension1.width !== dimension2.width;
    }
}

export interface Dimension {
    height: number;
    width: number;
}
