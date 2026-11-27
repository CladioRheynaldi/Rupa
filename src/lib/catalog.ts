import {photoCatalog} from './photo-catalog';
import type {ReferenceDesign} from './model';

// Migrated records keep their catalogue IDs and override local image URLs.
export function effectiveCatalog(uploaded:ReferenceDesign[]=[]):ReferenceDesign[]{
  const entries=new Map(photoCatalog.map(item=>[item.id,item]));
  for(const item of uploaded)entries.set(item.id,item);
  return [...entries.values()];
}
