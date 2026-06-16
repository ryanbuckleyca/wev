export type PostedWithinOption = '1-week' | '2-weeks' | '3-weeks' | '1-month';
export type PostedWithinValue = PostedWithinOption | 'any';

export type PostedWithinLabel = {
  fullKey: string;
  shortKey: string;
  fallbackShort: string;
};

export const postedWithinChipOptions: Record<PostedWithinOption, PostedWithinLabel> = {
  '1-week': {
    fullKey: 'filters.postedWithin.options.1Week',
    shortKey: 'filters.postedWithin.short.1Week',
    fallbackShort: '1 wk',
  },
  '2-weeks': {
    fullKey: 'filters.postedWithin.options.2Weeks',
    shortKey: 'filters.postedWithin.short.2Weeks',
    fallbackShort: '2 wks',
  },
  '3-weeks': {
    fullKey: 'filters.postedWithin.options.3Weeks',
    shortKey: 'filters.postedWithin.short.3Weeks',
    fallbackShort: '3 wks',
  },
  '1-month': {
    fullKey: 'filters.postedWithin.options.1Month',
    shortKey: 'filters.postedWithin.short.1Month',
    fallbackShort: '1 mo',
  },
};

export const postedWithinButtonValues: readonly PostedWithinValue[] = [
  '1-week',
  '2-weeks',
  '3-weeks',
  '1-month',
  'any',
];
