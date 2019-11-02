import { isNullOrUndefined } from '../utils';

/***
 * You can create a new instance or inherit and override default methods
 * Allows access to data and size. Clone with rows creates a new data provider and let listview know where to calculate row layout from.
 */
export class DataProvider {

    public hasRowChanged: (index: number) => boolean;
    private _firstIndexToProcess: number = 0;
    private _size: number = 0;
    private _data: any[] = [];

    constructor(hasRowChanged: (index: number) => boolean) {
        this.hasRowChanged = hasRowChanged;
    }

    public getSize(): number {
        return this._size;
    }

    public getFirstIndexToProcessInternal(): number {
        return this._firstIndexToProcess;
    }

    //
    //
    /**
     * No need to override this one.  
     * If you already know the first row where hasRowChanged will be false pass it upfront to avoid loop.
     */
    public cloneWithRows(newData: any[], firstModifiedIndex?: number): DataProvider {
        const dp = new DataProvider(this.hasRowChanged);
        const newSize = newData.length;
        const iterCount = Math.min(this._size, newSize);
        if (isNullOrUndefined(firstModifiedIndex)) {
            let i = 0;
            for (i = 0; i < iterCount; i++) {
                if (this.hasRowChanged(i)) {
                    break;
                }
            }
            dp._firstIndexToProcess = i;
        } else {
            dp._firstIndexToProcess = Math.max(Math.min(firstModifiedIndex, this._data.length), 0);
        }
        dp._data = newData;
        dp._size = newSize;
        return dp;
    }
}