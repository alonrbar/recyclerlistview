import * as React from 'react';
import { isNullOrUndefined } from '../utils';
import { Constants } from './constants/Constants';
import { DataProvider } from './DataProvider';
import { LayoutProvider, Dimension } from './LayoutProvider';
import CustomError from './exceptions/CustomError';
import RecyclerListViewExceptions from './exceptions/RecyclerListViewExceptions';
import ItemAnimator from './ItemAnimator';
import { Layout, LayoutManager, Point } from './LayoutManager';
import { BaseScrollComponent } from './scroll/BaseScrollComponent';
import { BaseScrollView, BaseScrollViewProps, ScrollEvent } from './scroll/BaseScrollView';
import { TOnItemStatusChanged } from './ViewabilityTracker';
import VirtualRenderer, { RenderStack, RenderStackParams } from './VirtualRenderer';
const debounce = require("lodash.debounce");

//#if [REACT-NATIVE]
// import { Platform } from 'react-native';
// import { DefaultJSItemAnimator as DefaultItemAnimator } from '../platform/reactnative/defaultjsanimator/DefaultJSItemAnimator';
// import ScrollComponent from '../platform/reactnative/ScrollComponent';
// import ViewRenderer from '../platform/reactnative/ViewRenderer';
// const IS_WEB = !Platform || Platform.OS === "web";
//#endif

// To use on web, start importing from recyclerlistview/web. To make it even
// easier specify an alias in you builder of choice.

//#if [WEB]
import ScrollComponent from "../platform/web/ScrollComponent";
import ViewRenderer from "../platform/web/ViewRenderer";
import { DefaultWebItemAnimator as DefaultItemAnimator } from "../platform/web/DefaultWebItemAnimator";
const IS_WEB = true;
//#endif


export interface OnRecreateParams {
    lastOffset?: number;
}

/***
 * Needs to have bounded size in all cases other than window scrolling (web).
 * NOTE: For reflowability set canChangeSize to true (experimental)
 */
export interface RecyclerListViewProps {
    layoutProvider: LayoutProvider;
    dataProvider: DataProvider;
    rowRenderer: (index: number) => React.ReactNode;
    /**
     * Used to maintain scroll position in case view gets destroyed e.g, cases
     * of back navigation 
     */
    contextProvider?: Map<string, string | number>;
    /**
     * Specify how many pixels in advance do you want views to be rendered.
     * Increasing this value can help reduce blanks (if any). However keeping
     * this as low as possible should be the intent. Higher values also increase
     * re-render compute.
     */
    renderAheadOffset?: number;
    isHorizontal?: boolean;
    onScroll?: (rawEvent: ScrollEvent, offsetX: number, offsetY: number) => void;
    /**
     * Called when recreating recycler view from context provider. Gives you the
     * initial params in the first frame itself to allow you to render content
     * accordingly.
     */
    onRecreate?: (params: OnRecreateParams) => void;
    /**
     * Callback given when user scrolls to the end of the list or footer just
     * becomes visible, useful in incremental loading scenarios
     */
    onEndReached?: () => void;
    /**
     * Specify how many pixels in advance you onEndReached callback
     */
    onEndReachedThreshold?: number;
    /**
     * Deprecated. Please use onVisibleIndicesChanged instead. 
     */
    onVisibleIndexesChanged?: TOnItemStatusChanged;
    /**
     * Provides visible index, helpful in sending impression events etc,
     * onVisibleIndicesChanged(all, now, notNow)
     */
    onVisibleIndicesChanged?: TOnItemStatusChanged;    
    /**
     * Provide your own ScrollView Component. The contract for the scroll event
     * should match the native scroll event contract, i.e.:  
     *   scrollEvent = { nativeEvent: { contentOffset: { x: offset, y: offset } } }  
     * Note: Please extend BaseScrollView to achieve expected behaviour 
     */
    externalScrollView?: { new(props: BaseScrollViewProps): BaseScrollView };
    initialOffset?: number;
    /**
     * Specify the initial item index you want rendering to start from.
     * Preferred over initialOffset if both are specified.
     */
    initialRenderIndex?: number;
    /**
     * iOS only. Scroll throttle duration.
     */
    scrollThrottle?: number;
    /**
     * Specify if size can change, listview will automatically relayout items.
     */
    canChangeSize?: boolean;
    /**
     * Specify how far away the first list item is from start of the
     * RecyclerListView. e.g, if you have content padding on top or left. This
     * is an adjustment for optimization and to make sure
     * onVisibileIndexesChanged callback is correct. Ideally try to avoid
     * setting large padding values on RLV content. If you have to please
     * correct offsets reported, handle them in a custom ScrollView and pass it
     * as an externalScrollView. If you want this to be accounted in
     * scrollToOffset please override the method and handle manually.
     */
    distanceFromWindow?: number;
    /**
     * Turns off recycling. You still get progressive rendering and all other
     * features. Good for lazy rendering. This should not be used in most cases.
     */
    disableRecycling?: boolean;
    /**
     * Default is false, if enabled dimensions provided in layout provider will
     * not be strictly enforced. Rendered dimensions will be used to relayout
     * items. Slower if enabled.
     */
    forceNonDeterministicRendering?: boolean;
    /**
     * Enables animating RecyclerListView item cells e.g, shift, add, remove
     * etc. This prop can be used to pass an external item animation
     * implementation. Look into
     * BaseItemAnimator/DefaultJSItemAnimator/DefaultNativeItemAnimator/DefaultWebItemAnimator
     * for more info. By default there are few animations, to disable completely
     * simply pass blank new BaseItemAnimator() object. Remember, create one
     * object and keep it do not create multiple object of type
     * BaseItemAnimator. Note: You might want to look into
     * DefaultNativeItemAnimator to check an implementation based on
     * LayoutAnimation. By default, animations are JS driven to avoid workflow
     * interference. Also, please note LayoutAnimation is buggy on Android.
     */
    itemAnimator?: ItemAnimator;    
    /**
     * To pass down style to inner ScrollView 
     */
    style?: object | number;
    /**
     * For all props that need to be proxied to inner/external scrollview. Put
     * them in an object and they'll be spread and passed down. For better
     * typescript support.
     */
    scrollViewProps?: object;
}

export interface RecyclerListViewState {
    renderStack: RenderStack;
    internalSnapshot: Record<string, object>;
}

export default class RecyclerListView<P extends RecyclerListViewProps, S extends RecyclerListViewState> extends React.Component<P, S> {

    public static defaultProps = {
        canChangeSize: false,
        disableRecycling: false,
        initialOffset: 0,
        initialRenderIndex: 0,
        isHorizontal: false,
        onEndReachedThreshold: 0,
        distanceFromWindow: 0,
        renderAheadOffset: IS_WEB ? 1000 : 250,
    };

    protected _virtualRenderer: VirtualRenderer;

    private refreshRequestDebouncer = debounce((toRun: VoidFunction) => toRun());
    private _onEndReachedCalled = false;
    private _initComplete = false;
    private _relayoutReqIndex: number = -1;
    private _params: RenderStackParams = {
        initialOffset: 0,
        initialRenderIndex: 0,
        isHorizontal: false,
        itemCount: 0,
        renderAheadOffset: 250,
    };
    private _layout: Dimension = { height: 0, width: 0 };
    private _pendingScrollToOffset: Point | null = null;
    private _initialOffset = 0;
    private _cachedLayouts?: Layout[];
    private _scrollComponent: BaseScrollComponent | null = null;
    private _defaultItemAnimator: ItemAnimator = new DefaultItemAnimator();

    constructor(props: P, context?: any) {
        super(props, context);

        this._virtualRenderer = new VirtualRenderer(
            this._renderStackWhenReady,
            offset => { this._pendingScrollToOffset = offset; },
            !props.disableRecycling
        );

        this.state = {
            internalSnapshot: {},
            renderStack: {},
        } as S;
    }

    //
    // public methods
    //

    public scrollToIndex(index: number, animate?: boolean): void {
        const layoutManager = this._virtualRenderer.getLayoutManager();
        if (layoutManager) {
            const offsets = layoutManager.getOffsetForIndex(index);
            this.scrollToOffset(offsets.x, offsets.y, animate);
        } else {
            console.warn("scrollTo was called before RecyclerListView was measured, please wait for the mount to finish."); //tslint:disable-line
        }
    }

    public scrollToTop(animate?: boolean): void {
        this.scrollToOffset(0, 0, animate);
    }

    public scrollToEnd(animate?: boolean): void {
        const lastIndex = this.props.dataProvider.getSize() - 1;
        this.scrollToIndex(lastIndex, animate);
    }

    public scrollToOffset = (x: number, y: number, animate: boolean = false): void => {
        if (this._scrollComponent) {
            if (this.props.isHorizontal) {
                y = 0;
            } else {
                x = 0;
            }
            this._scrollComponent.scrollTo(x, y, animate);
        }
    }

    /**
     * You can use requestAnimationFrame callback to change renderAhead in multiple frames to enable advanced progressive
     * rendering when view types are very complex. This method returns a boolean saying if the update was committed. Retry in
     * the next frame if you get a failure (if mount wasn't complete). Value should be greater than or equal to 0;
     * Very useful when you have a page where you need a large renderAheadOffset. Setting it at once will slow down the load and
     * this will help mitigate that.
     */
    public updateRenderAheadOffset(renderAheadOffset: number): boolean {
        const viewabilityTracker = this._virtualRenderer.getViewabilityTracker();
        if (viewabilityTracker) {
            viewabilityTracker.updateRenderAheadOffset(renderAheadOffset);
            return true;
        }
        return false;
    }

    public getCurrentRenderAheadOffset(): number {
        const viewabilityTracker = this._virtualRenderer.getViewabilityTracker();
        if (viewabilityTracker) {
            return viewabilityTracker.getCurrentRenderAheadOffset();
        }
        return this.props.renderAheadOffset!;
    }

    public getCurrentScrollOffset(): number {
        const viewabilityTracker = this._virtualRenderer.getViewabilityTracker();
        return viewabilityTracker ? viewabilityTracker.getLastActualOffset() : 0;
    }

    public findApproxFirstVisibleIndex(): number {
        const viewabilityTracker = this._virtualRenderer.getViewabilityTracker();
        return viewabilityTracker ? viewabilityTracker.findFirstLogicallyVisibleIndex() : 0;
    }

    public getRenderedSize(): Dimension {
        return this._layout;
    }

    public getContentDimension(): Dimension {
        return this._virtualRenderer.getLayoutDimension();
    }

    public forceRerender(): void {
        this.setState({
            internalSnapshot: {},
        });
    }

    //
    // life cycle
    //

    public UNSAFE_componentWillReceiveProps(newProps: RecyclerListViewProps): void {
        this._assertDependencyPresence(newProps);
        this._checkAndChangeLayouts(newProps);
        if (!this.props.onVisibleIndicesChanged) {
            this._virtualRenderer.removeVisibleItemsListener();
        }
        if (this.props.onVisibleIndexesChanged) {
            throw new CustomError(RecyclerListViewExceptions.usingOldVisibleIndexesChangedParam);
        }
        if (this.props.onVisibleIndicesChanged) {
            this._virtualRenderer.attachVisibleItemsListener(this.props.onVisibleIndicesChanged!);
        }
    }

    public componentDidUpdate(): void {
        if (this._pendingScrollToOffset) {
            const offset = this._pendingScrollToOffset;
            this._pendingScrollToOffset = null;
            if (this.props.isHorizontal) {
                offset.y = 0;
            } else {
                offset.x = 0;
            }
            setTimeout(() => {
                this.scrollToOffset(offset.x, offset.y, false);
            }, 0);
        }
        this._processOnEndReached();
        this._checkAndChangeLayouts(this.props);
        if (this.props.dataProvider.getSize() === 0) {
            console.warn(
                "You have mounted RecyclerListView with an empty data provider (Size in 0). " +
                "Please mount only if there is atleast one item " +
                "to ensure optimal performance and to avoid unexpected behavior"
            ); //tslint:disable-line
        }
    }

    public componentWillUnmount(): void {
        if (this.props.contextProvider) {
            this.props.contextProvider.set(Constants.CONTEXT_PROVIDER_OFFSET_KEY_SUFFIX, this.getCurrentScrollOffset());
            if (this.props.forceNonDeterministicRendering) {
                if (this._virtualRenderer) {
                    const layoutManager = this._virtualRenderer.getLayoutManager();
                    if (layoutManager) {
                        const layoutsToCache = layoutManager.getLayouts();
                        this.props.contextProvider.set(
                            Constants.CONTEXT_PROVIDER_LAYOUT_KEY_SUFFIX,
                            JSON.stringify({ layoutArray: layoutsToCache })
                        );
                    }
                }
            }
        }
    }

    public UNSAFE_componentWillMount(): void {
        if (this.props.contextProvider) {
            const offset = this.props.contextProvider.get(Constants.CONTEXT_PROVIDER_OFFSET_KEY_SUFFIX);
            if (typeof offset === "number" && offset > 0) {
                this._initialOffset = offset;
                if (this.props.onRecreate) {
                    this.props.onRecreate({ lastOffset: this._initialOffset });
                }
                this.props.contextProvider.delete(Constants.CONTEXT_PROVIDER_OFFSET_KEY_SUFFIX);
            }
            if (this.props.forceNonDeterministicRendering) {
                const cachedLayouts = this.props.contextProvider.get(Constants.CONTEXT_PROVIDER_LAYOUT_KEY_SUFFIX) as string;
                if (cachedLayouts && typeof cachedLayouts === "string") {
                    this._cachedLayouts = JSON.parse(cachedLayouts).layoutArray;
                    this.props.contextProvider.delete(Constants.CONTEXT_PROVIDER_LAYOUT_KEY_SUFFIX);
                }
            }
        }
    }

    //
    // render
    //

    public render(): JSX.Element {
        // TODO:Talha
        // const {
        //     layoutProvider,
        //     dataProvider,
        //     contextProvider,
        //     renderAheadOffset,
        //     onEndReached,
        //     onEndReachedThreshold,
        //     onVisibleIndicesChanged,
        //     initialOffset,
        //     initialRenderIndex,
        //     disableRecycling,
        //     forceNonDeterministicRendering,
        //     extendedState,
        //     itemAnimator,
        //     rowRenderer,
        //     ...props,
        // } = this.props;

        return (
            <ScrollComponent
                ref={(scrollComponent) => this._scrollComponent = scrollComponent as BaseScrollComponent | null}
                {...this.props}
                {...this.props.scrollViewProps}
                onScroll={this._onScroll}
                onSizeChanged={this._onSizeChanged}
                contentHeight={this._initComplete ? this._virtualRenderer.getLayoutDimension().height : 0}
                contentWidth={this._initComplete ? this._virtualRenderer.getLayoutDimension().width : 0}
            >
                {this._generateRenderStack()}
            </ScrollComponent>
        );
    }

    //
    // private methods
    //

    private _checkAndChangeLayouts(newProps: RecyclerListViewProps, forceFullRender?: boolean): void {
        this._params.isHorizontal = newProps.isHorizontal;
        this._params.itemCount = newProps.dataProvider.getSize();
        this._virtualRenderer.setParamsAndDimensions(this._params, this._layout);
        if (forceFullRender || this.props.layoutProvider !== newProps.layoutProvider || this.props.isHorizontal !== newProps.isHorizontal) {
            // TODO: Talha use old layout manager
            this._virtualRenderer.setLayoutManager(newProps.layoutProvider.newLayoutManager(this._layout, newProps.isHorizontal));
            if (newProps.layoutProvider.shouldRefreshWithAnchoring) {
                this._virtualRenderer.refreshWithAnchor();
            } else {
                this._virtualRenderer.refresh();
            }
            this._refreshViewability();
        } else if (this.props.dataProvider !== newProps.dataProvider) {
            if (newProps.dataProvider.getSize() > this.props.dataProvider.getSize()) {
                this._onEndReachedCalled = false;
            }
            const layoutManager = this._virtualRenderer.getLayoutManager();
            if (layoutManager) {
                layoutManager.relayoutFromIndex(newProps.dataProvider.getFirstIndexToProcessInternal(), newProps.dataProvider.getSize());
                this._virtualRenderer.refresh();
            }
        } else if (this._relayoutReqIndex >= 0) {
            const layoutManager = this._virtualRenderer.getLayoutManager();
            if (layoutManager) {
                const dataProviderSize = newProps.dataProvider.getSize();
                layoutManager.relayoutFromIndex(Math.min(Math.max(dataProviderSize - 1, 0), this._relayoutReqIndex), dataProviderSize);
                this._relayoutReqIndex = -1;
                this._refreshViewability();
            }
        }
    }

    private _refreshViewability(): void {
        this._virtualRenderer.refresh();
        this._queueStateRefresh();

    }

    private _queueStateRefresh(): void {
        this.refreshRequestDebouncer(() => {
            this.setState((prevState) => {
                return prevState;
            });
        });
    }

    private _onSizeChanged = (layout: Dimension): void => {
        const hasHeightChanged = this._layout.height !== layout.height;
        const hasWidthChanged = this._layout.width !== layout.width;
        this._layout.height = layout.height;
        this._layout.width = layout.width;
        if (layout.height === 0 || layout.width === 0) {
            throw new CustomError(RecyclerListViewExceptions.layoutException);
        }
        if (!this._initComplete) {
            this._initComplete = true;
            this._initTrackers();
            this._processOnEndReached();
        } else {
            if ((hasHeightChanged && hasWidthChanged) ||
                (hasHeightChanged && this.props.isHorizontal) ||
                (hasWidthChanged && !this.props.isHorizontal)) {
                this._checkAndChangeLayouts(this.props, true);
            } else {
                this._refreshViewability();
            }
        }
    }

    private _renderStackWhenReady = (stack: RenderStack): void => {
        this.setState(() => {
            return { renderStack: stack };
        });
    }

    private _initTrackers(): void {
        this._assertDependencyPresence(this.props);
        if (this.props.onVisibleIndexesChanged) {
            throw new CustomError(RecyclerListViewExceptions.usingOldVisibleIndexesChangedParam);
        }
        if (this.props.onVisibleIndicesChanged) {
            this._virtualRenderer.attachVisibleItemsListener(this.props.onVisibleIndicesChanged!);
        }
        this._params = {
            initialOffset: this._initialOffset ? this._initialOffset : this.props.initialOffset,
            initialRenderIndex: this.props.initialRenderIndex,
            isHorizontal: this.props.isHorizontal,
            itemCount: this.props.dataProvider.getSize(),
            renderAheadOffset: this.props.renderAheadOffset,
        };
        this._virtualRenderer.setParamsAndDimensions(this._params, this._layout);
        const layoutManager = this.props.layoutProvider.newLayoutManager(this._layout, this.props.isHorizontal, this._cachedLayouts);
        this._virtualRenderer.setLayoutManager(layoutManager);
        this._virtualRenderer.init();
        const offset = this._virtualRenderer.getInitialOffset();
        const contentDimension = layoutManager.getContentDimension();
        if ((offset.y > 0 && contentDimension.height > this._layout.height) ||
            (offset.x > 0 && contentDimension.width > this._layout.width)) {
            this._pendingScrollToOffset = offset;
            this.setState({});
        } else {
            this._virtualRenderer.startViewabilityTracker();
        }
    }

    private _assertDependencyPresence(props: RecyclerListViewProps): void {
        if (!props.dataProvider || !props.layoutProvider) {
            throw new CustomError(RecyclerListViewExceptions.unresolvedDependenciesException);
        }
    }

    private _renderRowUsingMeta(rowIndex: number): JSX.Element | null {
        const dataSize = this.props.dataProvider.getSize();
        if (!isNullOrUndefined(rowIndex) && rowIndex < dataSize) {
            const itemRect = (this._virtualRenderer.getLayoutManager() as LayoutManager).getLayouts()[rowIndex];
            const key = this._virtualRenderer.syncAndGetKey(rowIndex);
            if (!this.props.forceNonDeterministicRendering) {
                this._checkExpectedDimensionDiscrepancy(itemRect, rowIndex);
            }
            return (
                <ViewRenderer
                    key={key}
                    hasDataChanged={this.props.dataProvider.hasRowChanged}
                    x={itemRect.x}
                    y={itemRect.y}
                    index={rowIndex}
                    layoutProvider={this.props.layoutProvider}
                    forceNonDeterministicRendering={this.props.forceNonDeterministicRendering}
                    isHorizontal={this.props.isHorizontal}
                    onSizeChanged={this._onViewContainerSizeChange}
                    childRenderer={this.props.rowRenderer}
                    height={itemRect.height}
                    width={itemRect.width}
                    itemAnimator={this.props.itemAnimator || this._defaultItemAnimator}
                    internalSnapshot={this.state.internalSnapshot}
                />
            );
        }
        return null;
    }

    private _onViewContainerSizeChange = (dim: Dimension, index: number): void => {

        // Cannot be null here
        const layoutManager: LayoutManager = this._virtualRenderer.getLayoutManager() as LayoutManager;

        if (layoutManager.overrideLayout(index, dim)) {
            if (this._relayoutReqIndex === -1) {
                this._relayoutReqIndex = index;
            } else {
                this._relayoutReqIndex = Math.min(this._relayoutReqIndex, index);
            }
            this._queueStateRefresh();
        }
    }

    private _checkExpectedDimensionDiscrepancy(itemRect: Dimension, index: number): void {
        if (this.props.layoutProvider.checkDimensionDiscrepancy(itemRect, index)) {
            if (this._relayoutReqIndex === -1) {
                this._relayoutReqIndex = index;
            } else {
                this._relayoutReqIndex = Math.min(this._relayoutReqIndex, index);
            }
        }
    }

    private _generateRenderStack(): Array<JSX.Element | null> {
        const renderedItems = [];
        for (const key in this.state.renderStack) {
            if (this.state.renderStack.hasOwnProperty(key)) {
                renderedItems.push(this._renderRowUsingMeta(this.state.renderStack[key]));
            }
        }
        return renderedItems;
    }

    private _onScroll = (offsetX: number, offsetY: number, rawEvent: ScrollEvent): void => {
        //Adjusting offsets using distanceFromWindow
        this._virtualRenderer.updateOffset(offsetX, offsetY, -this.props.distanceFromWindow!, true);

        if (this.props.onScroll) {
            this.props.onScroll(rawEvent, offsetX, offsetY);
        }
        this._processOnEndReached();
    }

    private _processOnEndReached(): void {
        if (this.props.onEndReached && this._virtualRenderer) {
            const layout = this._virtualRenderer.getLayoutDimension();
            const viewabilityTracker = this._virtualRenderer.getViewabilityTracker();
            if (viewabilityTracker) {
                const windowBound = this.props.isHorizontal ? layout.width - this._layout.width : layout.height - this._layout.height;
                const lastOffset = viewabilityTracker ? viewabilityTracker.getLastOffset() : 0;
                if (windowBound - lastOffset <= (this.props.onEndReachedThreshold || 0)) {
                    if (this.props.onEndReached && !this._onEndReachedCalled) {
                        this._onEndReachedCalled = true;
                        this.props.onEndReached();
                    }
                } else {
                    this._onEndReachedCalled = false;
                }
            }
        }
    }
}
