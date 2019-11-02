import { storiesOf } from '@storybook/react';
import * as React from 'react';
import { VirtualList } from './VirtualList';

const stories = storiesOf('Virtual List', module);

stories.add('test', () => (
    <VirtualList
        dir="ltr"
        height={300}
        width={400}
        itemCount={100}
        itemSize={() => 50}
    >
        {index => (
            <div>
                {index}
            </div>
        )}
    </VirtualList>
));