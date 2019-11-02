import * as React from "react";
import { CSSProperties } from "react";
import { Dimension } from "../LayoutProvider";

export interface BaseScrollViewProps {
    onScroll: (event: ScrollEvent) => void;
    onSizeChanged: (dimensions: Dimension) => void;
    horizontal: boolean;
    canChangeSize: boolean;
    style?: CSSProperties | null;
}

export interface ScrollEvent {
    nativeEvent: {
        contentOffset: {
            x: number,
            y: number,
        },
        layoutMeasurement?: Dimension,
        contentSize?: Dimension,
    };
}

export abstract class BaseScrollView extends React.Component<BaseScrollViewProps, {}> {
    
    constructor(props: BaseScrollViewProps) {
        super(props);
    }

    public abstract scrollTo(scrollInput: { x: number, y: number, animated: boolean }): void;
}
