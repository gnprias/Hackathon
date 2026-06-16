import { sql } from '@databricks/appkit-ui/js';



export interface FacilitySearchCriteria {

  zip: string;

  city: string;

  state: string;

  countryCode: string;

  referenceAddress: string;

  filterHasPhone: boolean;

  filterHasEmail: boolean;

  filterHasWorkingWebsite: boolean;

  filterHasWorkingFacebook: boolean;

  filterHasSocial: boolean;

}



export const emptySearchCriteria = (): FacilitySearchCriteria => ({

  zip: '',

  city: '',

  state: '',

  countryCode: '',

  referenceAddress: '',

  filterHasPhone: false,

  filterHasEmail: false,

  filterHasWorkingWebsite: false,

  filterHasWorkingFacebook: false,

  filterHasSocial: false,

});



export function hasLocationCriteria(criteria: FacilitySearchCriteria): boolean {

  return (

    criteria.zip.trim() !== '' ||

    criteria.city.trim() !== '' ||

    criteria.state.trim() !== '' ||

    criteria.countryCode.trim() !== ''

  );

}



export function toLocationParams(criteria: Pick<FacilitySearchCriteria, 'zip' | 'city' | 'state' | 'countryCode'>) {
  return {
    zip: sql.string(criteria.zip.trim()),
    city: sql.string(criteria.city.trim()),
    state: sql.string(criteria.state.trim()),
    country_code: sql.string(criteria.countryCode.trim()),
  };
}

export function toFilterParams(criteria: FacilitySearchCriteria) {
  return {
    ...toLocationParams(criteria),

    filter_has_phone: sql.boolean(criteria.filterHasPhone),

    filter_has_email: sql.boolean(criteria.filterHasEmail),

    filter_has_working_website: sql.boolean(criteria.filterHasWorkingWebsite),

    filter_has_working_facebook: sql.boolean(criteria.filterHasWorkingFacebook),

    filter_has_social: sql.boolean(criteria.filterHasSocial),

  };

}



export function toStateLookupParams(criteria: Pick<FacilitySearchCriteria, 'countryCode' | 'city' | 'zip'>) {

  return {

    country_code: sql.string(criteria.countryCode.trim()),

    city: sql.string(criteria.city.trim()),

    zip: sql.string(criteria.zip.trim()),

  };

}



export function toCityLookupParams(criteria: Pick<FacilitySearchCriteria, 'countryCode' | 'state' | 'zip'>) {

  return {

    country_code: sql.string(criteria.countryCode.trim()),

    state: sql.string(criteria.state.trim()),

    zip: sql.string(criteria.zip.trim()),

  };

}


