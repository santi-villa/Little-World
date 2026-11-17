import allTexts from './data/texts.es.json';
import { defaultConfig, findSpecies, fullMealG, type AlertId, type SimState } from './sim';

const careText = allTexts.careUi;

/** A small meal scaled to the living animals, capped by their current appetite. */
export function suggestedFoodG(state: SimState): number {
  let grams = 0;
  for (const animal of state.animals) {
    const species = findSpecies(animal.speciesId);
    if (!animal.alive || !species) continue;
    grams += fullMealG(species, animal, defaultConfig) * Math.min(defaultConfig.food.suggestedMealHungerFraction, animal.hunger);
  }
  return Math.max(0, grams - state.food.surfaceG - state.food.sinkingG);
}
export const advice: Record<AlertId, string> = {
  ammonia_stress: careText.el_amoniaco_puede_acumularse_por_restos,
  ammonia_danger: careText.hay_amoniaco_toxico_hace_un_cambio,
  nitrite_stress: careText.las_bacterias_que_procesan_nitrito_todavia,
  nitrite_danger: careText.el_nitrito_dificulta_que_los_peces,
  nitrate_stress: careText.el_nitrato_es_el_producto_final,
  nitrate_danger: careText.el_nitrato_esta_muy_alto_hace,
  oxygen_stress: careText.falta_oxigeno_revisa_que_el_filtro,
  oxygen_danger: careText.el_oxigeno_esta_muy_bajo_encende,
  chlorine_present: careText.el_cloro_del_agua_de_canilla,
  ph_crash: careText.el_ph_esta_muy_bajo_revisa,
  kh_low: careText.el_kh_amortigua_los_cambios_de,
  water_low: careText.la_evaporacion_deja_los_minerales_en,
  filter_clogged: careText.la_suciedad_reduce_el_caudal_enjuaga,
  algae_bloom: careText.las_algas_aprovechan_luz_y_nutrientes,
};
