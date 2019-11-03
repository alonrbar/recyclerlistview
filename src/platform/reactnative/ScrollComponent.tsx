import * as React from 'react';
import { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView, View } from 'react-native';
import { BaseScrollComponent } from '../../core/scroll/BaseScrollComponent';
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

    private height = 0;
    private width = 0;
    private isSizeChangedCalledOnce = false;
    private scrollViewRef: ScrollView = null;

    public scrollTo(x: number, y: number, isAnimated: boolean): void {
        if (!this.scrollViewRef)
            return;
        this.scrollViewRef.scrollTo({ x, y, animated: isAnimated });
    }

    public render(): JSX.Element {
        const Scroller = TSCast.cast<ScrollView>(this.props.externalScrollView);
        return (
            <Scroller ref={this._getScrollViewRef}
                removeClippedSubviews={false}
                scrollEventThrottle={this.props.scrollThrottle}
                {...this.props}
                horizontal={this.props.isHorizontal}
                onScroll={this._onScroll}
                onLayout={(!this.isSizeChangedCalledOnce || this.props.canChangeSize) ? this._onLayout : this.props.onLayout}>
                <View style={{ flexDirection: this.props.isHorizontal ? "row" : "column" }}>
                    <View style={{
                        height: this.props.contentHeight,
                        width: this.props.contentWidth,
                    }}>
                        {this.props.children}
                    </View>
                </View>
            </Scroller>
        );
    }

    private _getScrollViewRef = (scrollView: any) => { this.scrollViewRef = scrollView as (ScrollView | null); };

    private _onScroll = (e?: NativeSyntheticEvent<NativeScrollEvent>): void => {
        if (e) {
            this.props.onScroll(e.nativeEvent.contentOffset.x, e.nativeEvent.contentOffset.y, e);
        }
    }

    private _onLayout = (e: LayoutChangeEvent): void => {
        if (this.height !== e.nativeEvent.layout.height || this.width !== e.nativeEvent.layout.width) {
            this.height = e.nativeEvent.layout.height;
            this.width = e.nativeEvent.layout.width;
            if (this.props.onSizeChanged) {
                this.isSizeChangedCalledOnce = true;
                this.props.onSizeChanged(e.nativeEvent.layout);
            }
        }
        if (this.props.onLayout) {
            this.props.onLayout(e);
        }
    }
}
