import React from 'react';
import { ChoresWidget } from '../../components/widgets/ChoresWidget';

const ChoresView: React.FC = () => {
    return (
        <div className="h-full w-full p-4">
            <ChoresWidget />
        </div>
    );
};

export default ChoresView;
