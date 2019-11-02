import * as React from "react";
import { Dimension, BaseLayoutProvider } from "./LayoutProvider";
import ItemAnimator from "./ItemAnimator";


export interface ViewRendererProps {
    x: number;
    y: number;
    height: number;
    width: number;
    childRenderer: (index: number, extendedState?: object) => JSX.Element | JSX.Element[] | null;
    hasDataChanged: (index: number) => boolean;
    onSizeChanged: (dim: Dimension, index: number) => void;
    index: number;
    itemAnimator: ItemAnimator;
    styleOverrides?: object;
    forceNonDeterministicRendering?: boolean;
    isHorizontal?: boolean;
    extendedState?: object;
    internalSnapshot?: object;
    layoutProvider?: BaseLayoutProvider;
}

/**
 * View renderer is responsible for creating a container of size provided by LayoutProvider and render content inside it.
 * Also enforces a logic to prevent re renders. RecyclerListView keeps moving these ViewRendereres around using transforms to enable recycling.
 * View renderer will only update if its position, dimensions or given data changes. Make sure to have a relevant shouldComponentUpdate as well.
 * This is second of the two things recycler works on. Implemented both for web and react native.
 */
export default abstract class BaseViewRenderer extends React.Component<ViewRendererProps, {}> {

    protected animatorStyleOverrides: object | undefined;

    public shouldComponentUpdate(newProps: ViewRendererProps): boolean {
        const hasMoved = this.props.x !== newProps.x || this.props.y !== newProps.y;

        const hasSizeChanged = !newProps.forceNonDeterministicRendering &&
            (this.props.width !== newProps.width || this.props.height !== newProps.height) ||
            this.props.layoutProvider !== newProps.layoutProvider;

        const hasExtendedStateChanged = this.props.extendedState !== newProps.extendedState;
        const hasInternalSnapshotChanged = this.props.internalSnapshot !== newProps.internalSnapshot;
        const hasDataChanged = this.props.hasDataChanged(this.props.index);
        let shouldUpdate = hasSizeChanged || hasDataChanged || hasExtendedStateChanged || hasInternalSnapshotChanged;
        if (shouldUpdate) {
            newProps.itemAnimator.animateWillUpdate(this.props.x, this.props.y, newProps.x, newProps.y, this.getRef() as object, newProps.index);
        } else if (hasMoved) {
            shouldUpdate = !newProps.itemAnimator.animateShift(this.props.x, this.props.y, newProps.x, newProps.y, this.getRef() as object, newProps.index);
        }
        return shouldUpdate;
    }
    
    public componentDidMount(): void {
        this.animatorStyleOverrides = undefined;
        this.props.itemAnimator.animateDidMount(this.props.x, this.props.y, this.getRef() as object, this.props.index);
    }

    public UNSAFE_componentWillMount(): void {
        this.animatorStyleOverrides = this.props.itemAnimator.animateWillMount(this.props.x, this.props.y, this.props.index);
    }

    public componentWillUnmount(): void {
        this.props.itemAnimator.animateWillUnmount(this.props.x, this.props.y, this.getRef() as object, this.props.index);
    }

    protected abstract getRef(): object | null;

    protected renderChild(): JSX.Element | JSX.Element[] | null {
        return this.props.childRenderer(this.props.index, this.props.extendedState);
    }
}
