// All app text in one place. 'hi' = Hinglish (Hindi in English letters).
// To fix a word, change it here. Every key must exist in both languages.

export type Language = 'en' | 'hi';

const en = {
  appName: 'GST Billing',
  tagline: 'Invoice Maker',

  chooseLanguage: 'Choose your language',
  chooseLanguageHint: 'You can change this later in settings',
  english: 'English',
  hinglish: 'Hinglish',
  continue: 'Continue',

  loginTitle: 'Login to continue',
  loginHint: 'Use your Google (Gmail) account. No password needed.',
  continueWithGoogle: 'Continue with Google',
  loginOffline: 'After login, the app works without internet.',
  noInternet: 'No internet. Please connect and try again.',
  noPlayServices: 'Google Play services are not available on this phone.',
  somethingWrong: 'Login failed. Please try again.',

  setupTitle: 'Set up your business',
  setupHint: 'These details appear on your invoices',
  businessName: 'Business name',
  businessNamePlaceholder: 'e.g. Raja Refrigeration',
  mobile: 'Mobile number',
  gstRegistered: 'Is your business GST registered?',
  yes: 'Yes',
  no: 'No',
  gstin: 'GSTIN',
  gstinPlaceholder: '15-character GSTIN',
  gstinValid: 'Valid GSTIN — state and PAN filled',
  pan: 'PAN',
  state: 'State',
  selectState: 'Select state',
  searchState: 'Search state',
  address: 'Address',
  city: 'City',
  pincode: 'Pincode',
  businessType: 'Business type',
  retail: 'Retail',
  wholesale: 'Wholesale',
  both: 'Both',
  saveBusiness: 'Save & start',
  optional: 'optional',

  errBusinessName: 'Please enter the business name',
  errMobile: 'Enter a valid 10-digit mobile number',
  errGstin: 'This GSTIN is not valid. Please check it.',
  errState: 'Please select the state',
  errPincode: 'Pincode must be 6 digits',
  errGstinState: 'GSTIN belongs to a different state',

  welcome: 'Welcome',
  loggedInAs: 'Logged in as',
  comingSoon: 'Parties, items and invoices are coming in the next steps.',
  logout: 'Logout',
  logoutConfirm: 'Logout from this phone? Your data stays saved on this phone.',
  cancel: 'Cancel',
};

export type StringKey = keyof typeof en;

const hi: Record<StringKey, string> = {
  appName: 'GST Billing',
  tagline: 'Invoice Maker',

  chooseLanguage: 'Apni bhasha chunein',
  chooseLanguageHint: 'Ise baad mein settings se badal sakte hain',
  english: 'English',
  hinglish: 'Hinglish',
  continue: 'Aage badhein',

  loginTitle: 'Aage badhne ke liye login karein',
  loginHint: 'Apne Google (Gmail) account se. Password ki zaroorat nahi.',
  continueWithGoogle: 'Google se login karein',
  loginOffline: 'Login ke baad app bina internet ke chalegi.',
  noInternet: 'Internet nahi hai. Connect karke dobara try karein.',
  noPlayServices: 'Is phone mein Google Play services nahi hai.',
  somethingWrong: 'Login nahi hua. Dobara try karein.',

  setupTitle: 'Apna business set up karein',
  setupHint: 'Ye details aapke bill par dikhengi',
  businessName: 'Business ka naam',
  businessNamePlaceholder: 'jaise Raja Refrigeration',
  mobile: 'Mobile number',
  gstRegistered: 'Kya aapka business GST registered hai?',
  yes: 'Haan',
  no: 'Nahi',
  gstin: 'GSTIN',
  gstinPlaceholder: '15 akshar ka GSTIN',
  gstinValid: 'GSTIN sahi hai — state aur PAN bhar diye',
  pan: 'PAN',
  state: 'State',
  selectState: 'State chunein',
  searchState: 'State khojein',
  address: 'Pata',
  city: 'Shehar',
  pincode: 'Pincode',
  businessType: 'Business ka type',
  retail: 'Retail',
  wholesale: 'Wholesale',
  both: 'Dono',
  saveBusiness: 'Save karke shuru karein',
  optional: 'zaroori nahi',

  errBusinessName: 'Business ka naam daalein',
  errMobile: 'Sahi 10 digit ka mobile number daalein',
  errGstin: 'Ye GSTIN sahi nahi hai. Check karein.',
  errState: 'State chunein',
  errPincode: 'Pincode 6 digit ka hona chahiye',
  errGstinState: 'GSTIN kisi aur state ka hai',

  welcome: 'Swagat hai',
  loggedInAs: 'Login hai',
  comingSoon: 'Party, item aur bill agle steps mein aa rahe hain.',
  logout: 'Logout',
  logoutConfirm: 'Is phone se logout karein? Aapka data isi phone par save rahega.',
  cancel: 'Cancel',
};

export const STRINGS: Record<Language, Record<StringKey, string>> = { en, hi };
