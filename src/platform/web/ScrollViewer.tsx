import * as React from 'react';
import { BaseScrollView, BaseScrollViewProps } from '../../core/scroll/BaseScrollView';
import { ScrollEventNormalizer } from './ScrollEventNormalizer';

/**
 * A scrollviewer that mimics react native scrollview. Additionally on web it can start listening to window scroll events optionally.
 * Supports both window scroll and scrollable divs inside other divs.
 */
export default class ScrollViewer extends BaseScrollView {

    public static defaultProps: Partial<BaseScrollViewProps> = {
        canChangeSize: false,
        horizontal: false,
        style: null
    };

    private _mainDivRef: HTMLDivElement | null = null;
    private _scrollEventNormalizer: ScrollEventNormalizer | null = null;

    public componentDidMount(): void {
        if (this.props.onSizeChanged) {
            if (this._mainDivRef) {
                this._startListeningToDivEvents();
                this.props.onSizeChanged({ height: this._mainDivRef.clientHeight, width: this._mainDivRef.clientWidth });
            }
        }
    }

    public componentWillUnmount(): void {
        window.removeEventListener("scroll", this._windowOnScroll);
        if (this._mainDivRef) {
            this._mainDivRef.removeEventListener("scroll", this._onScroll);
        }
    }

    public scrollTo(scrollInput: { x: number, y: number, animated: boolean }): void {
        if (scrollInput.animated) {
            this._doAnimatedScroll(this.props.horizontal ? scrollInput.x : scrollInput.y);
        } else {
            this._setRelevantOffset(this.props.horizontal ? scrollInput.x : scrollInput.y);
        }
    }

    public render(): JSX.Element {
        return (
            <div
                ref={this._setDivRef}
                style={{
                    WebkitOverflowScrolling: "touch",
                    height: "100%",
                    overflowX: this.props.horizontal ? "scroll" : "hidden",
                    overflowY: !this.props.horizontal ? "scroll" : "hidden",
                    width: "100%",
                    ...this.props.style,
                }}
            >
                <div style={{ position: "relative" }}>
                    {this.props.children}
                </div>
            </div>
        );
    }

    private _setDivRef = (div: HTMLDivElement | null): void => {
        this._mainDivRef = div;
        if (div) {
            this._scrollEventNormalizer = new ScrollEventNormalizer(div);
        } else {
            this._scrollEventNormalizer = null;
        }
    }

    private _getRelevantOffset = (): number => {
        if (this._mainDivRef) {
            if (this.props.horizontal) {
                return this._mainDivRef.scrollLeft;
            } else {
                return this._mainDivRef.scrollTop;
            }
        }
        return 0;
    }

    private _setRelevantOffset = (offset: number): void => {
        if (this._mainDivRef) {
            if (this.props.horizontal) {
                this._mainDivRef.scrollLeft = offset;
            } else {
                this._mainDivRef.scrollTop = offset;
            }
        }
    }

    private _doAnimatedScroll(offset: number): void {
        let start = this._getRelevantOffset();
        if (offset > start) {
            start = Math.max(offset - 800, start);
        } else {
            start = Math.min(offset + 800, start);
        }
        const change = offset - start;
        const increment = 20;
        const duration = 200;
        const animateScroll = (elapsedTime: number) => {
            elapsedTime += increment;
            const position = this._easeInOut(elapsedTime, start, change, duration);
            this._setRelevantOffset(position);
            if (elapsedTime < duration) {
                window.setTimeout(() => animateScroll(elapsedTime), increment);
            }
        };
        animateScroll(0);
    }

    private _startListeningToDivEvents(): void {
        if (this._mainDivRef) {
            this._mainDivRef.addEventListener("scroll", this._onScroll);
        }
    }

    private _windowOnScroll = (): void => {
        if (this.props.onScroll) {
            if (this._scrollEventNormalizer) {
                this.props.onScroll(this._scrollEventNormalizer.windowEvent);
            }
        }
    }

    private _onScroll = (): void => {
        if (this.props.onScroll) {
            if (this._scrollEventNormalizer) {
                this.props.onScroll(this._scrollEventNormalizer.divEvent);
            }
        }
    }

    private _easeInOut(currentTime: number, start: number, change: number, duration: number): number {
        currentTime /= duration / 2;
        if (currentTime < 1) {
            return change / 2 * currentTime * currentTime + start;
        }
        currentTime -= 1;
        return (-change) / 2 * (currentTime * (currentTime - 2) - 1) + start;
    }
}
