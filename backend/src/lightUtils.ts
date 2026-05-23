export const PLANT_LIGHT_RANGES = {
    // Fruiting vegetables — high light
    TOMATO:     { min: 20000, max: 50000, label: 'Tomato' },
    PEPPER:     { min: 22000, max: 45000, label: 'Pepper' },
    CUCUMBER:   { min: 21000, max: 40000, label: 'Cucumber' },
    ZUCCHINI:   { min: 20000, max: 40000, label: 'Zucchini' },
    EGGPLANT:   { min: 20000, max: 40000, label: 'Eggplant' },

    // Leafy greens — medium/low light
    LETTUCE:    { min: 10000, max: 20000, label: 'Lettuce' },
    SPINACH:    { min: 10000, max: 20000, label: 'Spinach' },
    KALE:       { min: 10000, max: 25000, label: 'Kale' },
    ARUGULA:    { min:  8000, max: 15000, label: 'Arugula' },
    RADISH:     { min: 10000, max: 20000, label: 'Radish' },

    // Herbs — medium light
    BASIL:      { min: 14000, max: 28000, label: 'Basil' },
    MINT:       { min: 10000, max: 20000, label: 'Mint' },
    PARSLEY:    { min: 10000, max: 20000, label: 'Parsley' },
    CILANTRO:   { min: 10000, max: 20000, label: 'Cilantro' },
    CHIVE:      { min: 10000, max: 20000, label: 'Chive' },
    OREGANO:    { min: 15000, max: 30000, label: 'Oregano' },
    THYME:      { min: 15000, max: 30000, label: 'Thyme' },
    ROSEMARY:   { min: 20000, max: 40000, label: 'Rosemary' },

    // Fruit
    STRAWBERRY: { min: 15000, max: 30000, label: 'Strawberry' },
    GRAPES:     { min: 25000, max: 50000, label: 'Grapes' },
    MELON:      { min: 22000, max: 45000, label: 'Melon' },
    WATERMELON: { min: 25000, max: 50000, label: 'Watermelon' },
};

export type PlantType = keyof typeof PLANT_LIGHT_RANGES;
export type LightStatus = 'TOO_LOW' | 'OPTIMAL' | 'TOO_HIGH';

export interface LightStatusData {
    status: LightStatus;
    message: string;
    icon: string;
    percentageOfOptimal: number;
}

export function getLightStatus(lux: number, plant: PlantType = 'TOMATO'): LightStatusData {
    const range = PLANT_LIGHT_RANGES[plant];

    if (lux < range.min) {
        const percentage = Math.round((lux / range.min) * 100);
        return {
            status: 'TOO_LOW',
            message: `Too low for ${range.label}`,
            icon: '🔴',
            percentageOfOptimal: percentage,
        };
    }

    if (lux > range.max) {
        const percentage = Math.round((lux / range.max) * 100);
        return {
            status: 'TOO_HIGH',
            message: `Too strong for ${range.label}`,
            icon: '🔥',
            percentageOfOptimal: Math.min(percentage, 150),
        };
    }

    const midpoint = (range.min + range.max) / 2;
    const percentage = Math.round((lux / midpoint) * 100);
    return {
        status: 'OPTIMAL',
        message: `Optimal for ${range.label}`,
        icon: '🟢',
        percentageOfOptimal: percentage,
    };
}

