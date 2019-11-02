import * as React from 'react';
import { LayoutProvider, RecyclerListView } from '../src';
import { range } from '../src/utils';
import { List, ListProps } from './List';

export class VirtualList extends React.PureComponent<ListProps> implements List {

    private get isHorizontal(): boolean {
        return this.props.layout === 'horizontal';
    }

    private readonly listRef = React.createRef<RecyclerListView<any, any>>();

    public refresh(): void {
        // throw new Error('Method not implemented.');
    }

    public scrollTo(offset: number): void {
        if (this.listRef.current) {
            const x = this.isHorizontal ? offset : undefined;
            const y = this.isHorizontal ? undefined : offset;
            this.listRef.current.scrollToOffset(x, y);
        }
    }

    public render() {

        const layoutProvider = new LayoutProvider(
            (dim, index) => {
                dim.width = this.isHorizontal ? this.props.itemSize(index) : this.props.width;
                dim.height = this.isHorizontal ? this.props.height : this.props.itemSize(index);
            }
        );

        // TODO: custom scrollbars
        return (
            <RecyclerListView
                ref={this.listRef}
                style={Object.assign({
                    width: this.props.width,
                    height: this.props.height
                }, this.props.style)}
                isHorizontal={this.isHorizontal}
                rowsCount={this.props.itemCount}
                hasRowChanged={(rowIndex: number) => false}
                layoutProvider={layoutProvider}
                rowRenderer={this.rowRenderer}
                renderAheadOffset={this.props.overscan}
            />
        );
    }

    private rowRenderer = (index: number) => {
        return this.props.children(index);
    }
}