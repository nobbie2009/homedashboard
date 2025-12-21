import React from 'react';
import {
    Trash2, Utensils, Dog, Cat, Bed, Shirt,
    Sparkles, Brush, Recycle, Flower2,
    ShoppingCart, Dishplate, Monitor, Gamepad2, Book
} from 'lucide-react';

export const IconMap: Record<string, React.FC<any>> = {
    'trash': Trash2,
    'dishes': Utensils, // or Dishplate
    'dog': Dog,
    'cat': Cat,
    'bed': Bed,
    'laundry': Shirt,
    'clean': Sparkles,
    'sweep': Brush,
    'recycle': Recycle,
    'plants': Flower2,
    'shopping': ShoppingCart,
    'plate': Utensils, // Fallback to Utensils
    'screen': Monitor,
    'play': Gamepad2,
    'homework': Book
};

interface ChoreIconProps {
    icon: string;
    className?: string;
}

export const ChoreIcon: React.FC<ChoreIconProps> = ({ icon, className }) => {
    const IconComponent = IconMap[icon] || Sparkles; // Default to Sparkles
    return <IconComponent className={className} />;
};
