import { PlantType } from '../services/plant.service';
import type { IconName } from '../../shared/components/atoms/icon.component';

export const PLANT_TYPE_STYLE: Record<PlantType, { emoji: string; icon: IconName; bg: string; fg: string }> = {
  TOMATO:     { emoji: '🍅', icon: 'fruit',    bg: 'bg-orange-50',  fg: 'text-orange-500'  },
  PEPPER:     { emoji: '🌶️', icon: 'pepper',   bg: 'bg-red-50',     fg: 'text-red-500'     },
  CUCUMBER:   { emoji: '🥒', icon: 'cucumber', bg: 'bg-lime-50',    fg: 'text-lime-600'    },
  ZUCCHINI:   { emoji: '🥬', icon: 'cucumber', bg: 'bg-green-50',   fg: 'text-green-600'   },
  EGGPLANT:   { emoji: '🍆', icon: 'fruit',    bg: 'bg-purple-50',  fg: 'text-purple-500'  },
  LETTUCE:    { emoji: '🥬', icon: 'leafy',    bg: 'bg-green-50',   fg: 'text-green-600'   },
  SPINACH:    { emoji: '🥬', icon: 'leafy',    bg: 'bg-emerald-50', fg: 'text-emerald-600' },
  KALE:       { emoji: '🥬', icon: 'leafy',    bg: 'bg-teal-50',    fg: 'text-teal-600'    },
  ARUGULA:    { emoji: '🌿', icon: 'herb',     bg: 'bg-lime-50',    fg: 'text-lime-600'    },
  RADISH:     { emoji: '🌱', icon: 'sprout',   bg: 'bg-pink-50',    fg: 'text-pink-500'    },
  BASIL:      { emoji: '🌿', icon: 'herb',     bg: 'bg-teal-50',    fg: 'text-teal-600'    },
  MINT:       { emoji: '🌱', icon: 'herb',     bg: 'bg-emerald-50', fg: 'text-emerald-600' },
  PARSLEY:    { emoji: '🌿', icon: 'herb',     bg: 'bg-green-50',   fg: 'text-green-600'   },
  CILANTRO:   { emoji: '🌿', icon: 'herb',     bg: 'bg-lime-50',    fg: 'text-lime-600'    },
  CHIVE:      { emoji: '🌱', icon: 'sprout',   bg: 'bg-green-50',   fg: 'text-green-600'   },
  OREGANO:    { emoji: '🌿', icon: 'herb',     bg: 'bg-amber-50',   fg: 'text-amber-600'   },
  THYME:      { emoji: '🌿', icon: 'herb',     bg: 'bg-yellow-50',  fg: 'text-yellow-600'  },
  ROSEMARY:   { emoji: '🌿', icon: 'herb',     bg: 'bg-sky-50',     fg: 'text-sky-600'     },
  STRAWBERRY: { emoji: '🍓', icon: 'berry',    bg: 'bg-red-50',     fg: 'text-red-500'     },
  GRAPES:     { emoji: '🍇', icon: 'grapes',   bg: 'bg-purple-50',  fg: 'text-purple-500'  },
  MELON:      { emoji: '🍈', icon: 'melon',    bg: 'bg-yellow-50',  fg: 'text-yellow-600'  },
  WATERMELON: { emoji: '🍉', icon: 'melon',    bg: 'bg-pink-50',    fg: 'text-pink-500'    },
};
