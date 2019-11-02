import * as React from "react";
import { Dimension } from "../LayoutProvider";
import { ScrollEvent, BaseScrollView, BaseScrollViewProps } from "./BaseScrollView";

export interface ScrollComponentProps {
    onSizeChanged: (dimensions: Dimension) => void;
    onScroll: (offsetX: number, offsetY: number, rawEvent: ScrollEvent) => void;
    contentHeight: number;
    contentWidth: number;
    canChangeSize?: boolean;
    externalScrollView?: { new(props: BaseScrollViewProps): BaseScrollView };
    isHorizontal?: boolean;
    scrollThrottle?: number;
    onLayout?: any;
}
export abstract class BaseScrollComponent extends React.Component<ScrollComponentProps, {}> {
    public abstract scrollTo(x: number, y: number, animate: boolean): void;
}
