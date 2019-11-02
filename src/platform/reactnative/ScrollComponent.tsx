import * as React from 'react';
import { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView, View } from 'react-native';
import { BaseScrollComponent, ScrollComponentProps } from '../../core/scroll/BaseScrollComponent';
import TSCast from '../../utils/TSCast';

/**
 * The responsibility of a scroll component is to report its size, scroll events
 * and provide a way to scroll to a given offset. RecyclerListView works on top
 * of this interface and doesn't care about the implementation. To support web
 * we only had to provide another component written on top of web elements
 */
export default class ScrollComponent extends BaseScrollComponent {

    public static defaultProps = {
        contentHeight: 0,
        contentWidth: 0,
        externalScrollView: TSCast.cast(ScrollView), //TSI
        isHorizontal: false,
        scrollThrottle: 16,
    };

    private _height: number;
    private _width: number;
    private _isSizeChangedCalledOnce: boolean;
    private _scrollViewRef: ScrollView | null = null;

    constructor(args: ScrollComponentProps) {
        super(args);
        this._height = 0;
        this._width = 0;
        this._isSizeChangedCalledOnce = false;
    }

    public scrollTo(x: number, y: number, isAnimated: boolean): void {
        if (this._scrollViewRef) {
            this._scrollViewRef.scrollTo({ x, y, animated: isAnimated });
        }
    }

    public render(): JSX.Element {
        const Scroller = TSCast.cast<ScrollView>(this.props.externalScrollView); //TSI
        //TODO:Talha
        // const {
        //     useWindowScroll,
        //     contentHeight,
        //     contentWidth,
        //     externalScrollView,
        //     canChangeSize,
        //     renderFooter,
        //     isHorizontal,
        //     scrollThrottle,
        //     ...props,
        // } = this.props;
        return (
            <Scroller ref={this._getScrollViewRef}
                removeClippedSubviews={false}
                scrollEventThrottle={this.props.scrollThrottle}
                {...this.props}
                horizontal={this.props.isHorizontal}
                onScroll={this._onScroll}
                onLayout={(!this._isSizeChangedCalledOnce || this.props.canChangeSize) ? this._onLayout : this.props.onLayout}>
                <View style={{ flexDirection: this.props.isHorizontal ? "row" : "column" }}>
                    <View style={{
                        height: this.props.contentHeight,
                        width: this.props.contentWidth,
                    }}>
                        {this.props.children}
                    </View>
                    {this.props.renderFooter ? this.props.renderFooter() : null}
                </View>
            </Scroller>
        );
    }

    private _getScrollViewRef = (scrollView: any) => { this._scrollViewRef = scrollView as (ScrollView | null); };

    private _onScroll = (e?: NativeSyntheticEvent<NativeScrollEvent>): void => {
        if (e) {
            this.props.onScroll(e.nativeEvent.contentOffset.x, e.nativeEvent.contentOffset.y, e);
        }
    }

    private _onLayout = (e: LayoutChangeEvent): void => {
        if (this._height !== e.nativeEvent.layout.height || this._width !== e.nativeEvent.layout.width) {
            this._height = e.nativeEvent.layout.height;
            this._width = e.nativeEvent.layout.width;
            if (this.props.onSizeChanged) {
                this._isSizeChangedCalledOnce = true;
                this.props.onSizeChanged(e.nativeEvent.layout);
            }
        }
        if (this.props.onLayout) {
            this.props.onLayout(e);
        }
    }
}
