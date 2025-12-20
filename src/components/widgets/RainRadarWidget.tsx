import React from 'react';

export const RainRadarWidget: React.FC = () => {
    return (
        <div className="h-full w-full bg-slate-800/60 rounded-xl backdrop-blur-md shadow-lg border border-slate-700 overflow-hidden relative">
            <iframe
                src="https://www.rainviewer.com/map.html?loc=51.1657,10.4515,6&oFa=0&oC=0&oU=0&oCS=1&oF=0&oAP=1&c=3&o=83&lm=1&layer=radar&sm=1&sn=1"
                className="w-full h-full border-0"
                allowFullScreen
            />
            <div className="absolute top-0 left-0 bg-slate-900/50 px-2 py-1 rounded-br-lg pointer-events-none">
                <span className="text-white text-xs font-semibold">Regenradar</span>
            </div>
        </div>
    );
};
