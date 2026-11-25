// English interface dictionary. Typed against the Hebrew one, so a feature
// file or a key missing here fails the build; scripts/test-i18n-keys.cjs
// checks the reverse (extra keys) and placeholders.
import type he from '../he';
import common from './common.json';
import shell from './shell.json';
import auth from './auth.json';
import registration from './registration.json';
import categories from './categories.json';
import onboarding from './onboarding.json';
import dashboard from './dashboard.json';
import campaignsList from './campaignsList.json';
import donations from './donations.json';
import management from './management.json';
import settings from './settings.json';
import partners from './partners.json';
import studio from './studio.json';
import builder from './builder.json';
import editors from './editors.json';
import publicPage from './publicPage.json';
import platform from './platform.json';

const en: typeof he = {
  common,
  shell,
  auth,
  registration,
  categories,
  onboarding,
  dashboard,
  campaignsList,
  donations,
  management,
  settings,
  partners,
  studio,
  builder,
  editors,
  publicPage,
  platform,
};

export default en;
