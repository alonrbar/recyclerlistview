

/**
 * Recycle pool for maintaining recyclable items.
 */
export default class RecycleItemPool {

    private readonly keys = new Set<React.Key>();

    public add(key: React.Key): void {
        this.keys.add(key);
    }    

    public remove(key: React.Key): void {
        this.keys.delete(key);
    }

    public getNext(): React.Key {
        if (!this.keys.size)
            return undefined;

        const keysIterator = this.keys.keys().next();
        const result = keysIterator.value;

        this.keys.delete(result);
        
        return result;
    }
}
