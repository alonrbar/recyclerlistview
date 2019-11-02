import * as React from "react";
import { Dimension, LayoutProvider } from "./LayoutProvider";
import ItemAnimator from "./ItemAnimator";


export interface ViewRendererProps {
    x: number;
    y: number;
    height: number;
    width: number;
    childRenderer: (index: number) => React.ReactNode;
    hasDataChanged: (index: number) => boolean;
    onSizeChanged: (dim: Dimension, index: number) => void;
    index: number;
    itemAnimator: ItemAnimator;
    forceNonDeterministicRendering?: boolean;
    isHorizontal?: boolean;
    renderForcer?: object;
    layoutProvider?: LayoutProvider;
}

/**
 * View renderer is responsible for creating a container of size provided by LayoutProvider and render content inside it.
 * Also enforces a logic to prevent re renders. RecyclerListView keeps moving these ViewRendereres around using transforms to enable recycling.
 * View renderer will only update if its position, dimensions or given data changes. Make sure to have a relevant shouldComponentUpdate as well.
 * This is second of the two things recycler works on. Implemented both for web and react native.
 */
export default abstract class BaseViewRenderer extends React.Component<ViewRendererProps, {}> {

    public shouldComponentUpdate(newProps: ViewRendererProps): boolean {
        const hasMoved = this.props.x !== newProps.x || this.props.y !== newProps.y;

        const hasSizeChanged = !newProps.forceNonDeterministicRendering &&
            (this.props.width !== newProps.width || this.props.height !== newProps.height) ||
            this.props.layoutProvider !== newProps.layoutProvider;
        const hasDataChanged = this.props.hasDataChanged(this.props.index);
        const shouldForceRender = this.props.renderForcer !== newProps.renderForcer;
        
        let shouldUpdate = hasSizeChanged || hasDataChanged || shouldForceRender;
        if (shouldUpdate) {
            newProps.itemAnimator.animateWillUpdate(this.props.x, this.props.y, newProps.x, newProps.y, this.getRef() as object, newProps.index);
        } else if (hasMoved) {
            shouldUpdate = !newProps.itemAnimator.animateShift(this.props.x, this.props.y, newProps.x, newProps.y, this.getRef() as object, newProps.index);
        }
        return shouldUpdate;
    }

    public componentWillUnmount(): void {
        this.props.itemAnimator.animateWillUnmount(this.props.x, this.props.y, this.getRef() as object, this.props.index);
    }

    protected abstract getRef(): object | null;

    protected renderChild(): React.ReactNode {
        return this.props.childRenderer(this.props.index);
    }
}
