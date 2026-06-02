import { Injectable, inject, signal, computed } from '@angular/core';
import { ApolloClient, gql } from '@apollo/client/core';
import { Observable, defer } from 'rxjs';
import { TranslocoService } from '@jsverse/transloco';
import dayjs from 'dayjs';
import { GraphQLClientService } from './graphql-client.service';
import { daysAgo } from '../utils/time';

export type PlantType =
  | 'TOMATO' | 'PEPPER' | 'CUCUMBER' | 'ZUCCHINI' | 'EGGPLANT'
  | 'LETTUCE' | 'SPINACH' | 'KALE' | 'ARUGULA' | 'RADISH'
  | 'BASIL' | 'MINT' | 'PARSLEY' | 'CILANTRO' | 'CHIVE'
  | 'OREGANO' | 'THYME' | 'ROSEMARY'
  | 'STRAWBERRY' | 'GRAPES' | 'MELON' | 'WATERMELON';

export interface PlantTypeOption {
  value: PlantType;
  label: string;
  group: string;
}

export const PLANT_TYPE_OPTIONS: PlantTypeOption[] = [
  { value: 'TOMATO',     label: 'Tomato',      group: 'Fruiting vegetables' },
  { value: 'PEPPER',     label: 'Pepper',      group: 'Fruiting vegetables' },
  { value: 'CUCUMBER',   label: 'Cucumber',    group: 'Fruiting vegetables' },
  { value: 'ZUCCHINI',   label: 'Zucchini',    group: 'Fruiting vegetables' },
  { value: 'EGGPLANT',   label: 'Eggplant',    group: 'Fruiting vegetables' },
  { value: 'LETTUCE',    label: 'Lettuce',      group: 'Leafy greens' },
  { value: 'SPINACH',    label: 'Spinach',      group: 'Leafy greens' },
  { value: 'KALE',       label: 'Kale',         group: 'Leafy greens' },
  { value: 'ARUGULA',    label: 'Arugula',      group: 'Leafy greens' },
  { value: 'RADISH',     label: 'Radish',       group: 'Leafy greens' },
  { value: 'BASIL',      label: 'Basil',        group: 'Herbs' },
  { value: 'MINT',       label: 'Mint',         group: 'Herbs' },
  { value: 'PARSLEY',    label: 'Parsley',      group: 'Herbs' },
  { value: 'CILANTRO',   label: 'Cilantro',     group: 'Herbs' },
  { value: 'CHIVE',      label: 'Chive',        group: 'Herbs' },
  { value: 'OREGANO',    label: 'Oregano',      group: 'Herbs' },
  { value: 'THYME',      label: 'Thyme',        group: 'Herbs' },
  { value: 'ROSEMARY',   label: 'Rosemary',     group: 'Herbs' },
  { value: 'STRAWBERRY', label: 'Strawberry',   group: 'Fruit' },
  { value: 'GRAPES',     label: 'Grapes',       group: 'Fruit' },
  { value: 'MELON',      label: 'Melon',        group: 'Fruit' },
  { value: 'WATERMELON', label: 'Watermelon',   group: 'Fruit' },
];

export interface Plant {
  id: string;
  name: string;
  type: PlantType;
  plantedDate: Date;
  count: number;
  monitored: boolean;
  archived: boolean;
  dailyLightHours: number;
  code: string | null;
}

const PLANT_FIELDS = `id name type plantedDate count monitored archived dailyLightHours code`;

const SET_MONITORED = gql`
  mutation SetPlantMonitored($id: String!, $monitored: Boolean!) {
    setPlantMonitored(id: $id, monitored: $monitored) { ${PLANT_FIELDS} }
  }
`;

const SET_ARCHIVED = gql`
  mutation SetPlantArchived($id: String!, $archived: Boolean!) {
    setPlantArchived(id: $id, archived: $archived) { ${PLANT_FIELDS} }
  }
`;

const PLANTS_QUERY_ALL = gql`
  query GetAllPlants {
    plants(includeArchived: true) { ${PLANT_FIELDS} }
  }
`;

const ADD_PLANT = gql`
  mutation AddPlant($name: String!, $type: PlantType!, $plantedDate: String!, $count: Int!, $dailyLightHours: Int) {
    addPlant(name: $name, type: $type, plantedDate: $plantedDate, count: $count, dailyLightHours: $dailyLightHours) { ${PLANT_FIELDS} }
  }
`;

const UPDATE_PLANT = gql`
  mutation UpdatePlant($id: String!, $name: String!, $type: PlantType!, $plantedDate: String!, $count: Int!, $dailyLightHours: Int) {
    updatePlant(id: $id, name: $name, type: $type, plantedDate: $plantedDate, count: $count, dailyLightHours: $dailyLightHours) { ${PLANT_FIELDS} }
  }
`;

const REMOVE_PLANT = gql`
  mutation RemovePlant($id: String!) {
    removePlant(id: $id)
  }
`;

interface RawPlant { id: string; name: string; type: string; plantedDate: string; count: number; monitored: boolean; archived: boolean; dailyLightHours: number; code: string | null; }

@Injectable({ providedIn: 'root' })
export class PlantService {
  private client: ApolloClient;
  private transloco = inject(TranslocoService);
  private allPlants = signal<Plant[]>([]);
  plantsLoading = signal(true);

  // Default `plants` excludes archived for backwards compatibility with all existing callers
  plants = computed(() => this.allPlants().filter(p => !p.archived));
  archivedPlants = computed(() => this.allPlants().filter(p => p.archived));

  constructor(gqlClient: GraphQLClientService) {
    this.client = gqlClient.client;
    this.loadPlants();
  }

  /** Localised plant type label, e.g. TOMATO → "Tomato" / "Tomat". */
  getTypeLabel(type: PlantType | string): string {
    return this.transloco.translate(`plantTypes.${type}`);
  }

  private loadPlants() {
    this.client
      .query<{ plants: RawPlant[] }>({ query: PLANTS_QUERY_ALL, fetchPolicy: 'network-only' })
      .then(result => this.allPlants.set(this.mapPlants(result.data?.plants ?? [])))
      .catch(err => console.error('Failed to load plants:', err))
      .finally(() => this.plantsLoading.set(false));
  }

  private mapPlants(raw: RawPlant[]): Plant[] {
    return raw.map(p => {
      const parsed = dayjs(p.plantedDate);
      return {
        ...p,
        type: p.type as PlantType,
        plantedDate: parsed.isValid() ? parsed.toDate() : new Date(),
        count: p.count ?? 1,
        monitored: p.monitored ?? true,
        archived: p.archived ?? false,
        dailyLightHours: p.dailyLightHours ?? 12,
        code: p.code ?? null,
      };
    });
  }

  add(name: string, type: PlantType, plantedDate: Date, count: number, dailyLightHours = 12): Observable<Plant> {
    return defer(() =>
      this.client.mutate<{ addPlant: RawPlant }>({
        mutation: ADD_PLANT,
        variables: { name: name.trim(), type: type.trim(), plantedDate: dayjs(plantedDate).toISOString(), count, dailyLightHours },
      }).then(result => {
        const mapped = this.mapPlants([result.data!.addPlant])[0];
        this.allPlants.update(ps => [...ps, mapped]);
        return mapped;
      })
    );
  }

  update(id: string, name: string, type: PlantType, plantedDate: Date, count: number, dailyLightHours = 12): Observable<Plant> {
    return defer(() =>
      this.client.mutate<{ updatePlant: RawPlant }>({
        mutation: UPDATE_PLANT,
        variables: { id, name: name.trim(), type, plantedDate: dayjs(plantedDate).toISOString(), count, dailyLightHours },
      }).then(result => {
        const mapped = this.mapPlants([result.data!.updatePlant])[0];
        this.allPlants.update(ps => ps.map(p => p.id === id ? mapped : p));
        return mapped;
      })
    );
  }

  remove(id: string): Observable<boolean> {
    return defer(() =>
      this.client.mutate<{ removePlant: boolean }>({
        mutation: REMOVE_PLANT,
        variables: { id },
      }).then(() => {
        this.allPlants.update(ps => ps.filter(p => p.id !== id));
        return true;
      })
    );
  }

  setMonitored(id: string, monitored: boolean): Observable<Plant> {
    return defer(() =>
      this.client.mutate<{ setPlantMonitored: RawPlant }>({
        mutation: SET_MONITORED,
        variables: { id, monitored },
      }).then(result => {
        const mapped = this.mapPlants([result.data!.setPlantMonitored])[0];
        this.allPlants.update(ps => ps.map(p => p.id === id ? mapped : p));
        return mapped;
      })
    );
  }

  setArchived(id: string, archived: boolean): Observable<Plant> {
    return defer(() =>
      this.client.mutate<{ setPlantArchived: RawPlant }>({
        mutation: SET_ARCHIVED,
        variables: { id, archived },
      }).then(result => {
        const mapped = this.mapPlants([result.data!.setPlantArchived])[0];
        this.allPlants.update(ps => ps.map(p => p.id === id ? mapped : p));
        return mapped;
      })
    );
  }

  getAgeLabel(plant: Plant): string {
    const days = daysAgo(plant.plantedDate);
    if (days < 7) return days === 1 ? this.transloco.translate('age.dayOneOld') : this.transloco.translate('age.daysOld', { n: days });
    const weeks = Math.floor(days / 7);
    if (weeks < 8) return weeks === 1 ? this.transloco.translate('age.weekOneOld') : this.transloco.translate('age.weeksOld', { n: weeks });
    const months = Math.floor(days / 30);
    return months === 1 ? this.transloco.translate('age.monthOneOld') : this.transloco.translate('age.monthsOld', { n: months });
  }

  getAgeShort(plant: Plant): string {
    const days = daysAgo(plant.plantedDate);
    if (days < 7) return days === 1 ? this.transloco.translate('age.dayOne') : this.transloco.translate('age.days', { n: days });
    const weeks = Math.floor(days / 7);
    if (weeks < 8) return weeks === 1 ? this.transloco.translate('age.weekOne') : this.transloco.translate('age.weeks', { n: weeks });
    const months = Math.floor(days / 30);
    return months === 1 ? this.transloco.translate('age.monthOne') : this.transloco.translate('age.months', { n: months });
  }

  readonly typeGroups = Array.from(
    PLANT_TYPE_OPTIONS.reduce((map, opt) => {
      if (!map.has(opt.group)) map.set(opt.group, []);
      map.get(opt.group)!.push(opt);
      return map;
    }, new Map<string, PlantTypeOption[]>())
  ).map(([name, options]) => ({ name, options }));
}
