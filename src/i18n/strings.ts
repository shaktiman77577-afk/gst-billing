// All app text in one place. 'hi' = Hinglish (Hindi in English letters).
// To fix a word, change it here. Every key must exist in both languages.

export type Language = 'en' | 'hi';

const en = {
  appName: 'GST Billing',
  tagline: 'Invoice Maker',
  taglineHindi: 'आपका हिसाब, आपके हाथ में',
  english: 'English',
  hinglish: 'Hinglish',
  cancel: 'Cancel',
  optional: 'optional',
  yes: 'Yes',
  no: 'No',
  comingSoon: 'Coming in the next update',

  // Login
  loginTitle: 'Welcome 👋',
  loginHint: 'Login with your Google account. No password needed.',
  continueWithGoogle: 'Continue with Google',
  benefitFast: 'Make GST bills in 30 seconds',
  benefitOffline: 'Works without internet',
  benefitSafe: 'Your data stays safe on your phone',
  noInternet: 'No internet. Please connect and try again.',
  noPlayServices: 'Google Play services are not available on this phone.',
  somethingWrong: 'Login failed. Please try again.',

  // Business setup
  setupTitle: 'Set up your business',
  setupHint: 'These details will appear on your bills. You can edit them later.',
  sectionBusiness: 'Business details',
  sectionGst: 'GST details',
  sectionAddress: 'Address',
  businessName: 'Business name',
  businessNamePlaceholder: 'e.g. Raja Refrigeration',
  mobile: 'Mobile number',
  gstRegistered: 'Is your business GST registered?',
  gstin: 'GSTIN',
  gstinPlaceholder: '15-character GSTIN',
  gstinValid: 'Valid GSTIN — state and PAN filled',
  notGstHint: 'No problem — you can still make bills (Bill of Supply).',
  pan: 'PAN',
  state: 'State',
  selectState: 'Select state',
  searchState: 'Search state',
  address: 'Shop / office address',
  addressPlaceholder: 'Shop no., building, area',
  city: 'City',
  pincode: 'Pincode',
  businessType: 'Business type',
  retail: 'Retail',
  wholesale: 'Wholesale',
  both: 'Both',
  saveBusiness: 'Save & start billing',

  errBusinessName: 'Please enter the business name',
  errMobile: 'Enter a valid 10-digit mobile number',
  errGstin: 'This GSTIN is not valid. Please check it.',
  errState: 'Please select the state',
  errPincode: 'Pincode must be 6 digits',
  errGstinState: 'GSTIN belongs to a different state',

  // Tabs
  tabHome: 'Home',
  tabParties: 'Parties',
  tabItems: 'Items',
  tabMore: 'More',

  // Home
  goodMorning: 'Good morning',
  goodAfternoon: 'Good afternoon',
  goodEvening: 'Good evening',
  toCollect: 'To Collect',
  toPay: 'To Pay',
  quickActions: 'Quick actions',
  newBill: 'New Bill',
  addParty: 'Add Party',
  addItem: 'Add Item',
  recentBills: 'Recent bills',
  noBillsYet: 'No bills yet',
  noBillsHint: 'Your bills will show here once you create them.',

  // Parties / Items (placeholders until the next update)
  partiesEmpty: 'Your customers & suppliers',
  partiesEmptyHint: 'Add parties to track who owes you and whom you owe.',
  itemsEmpty: 'Your products & services',
  itemsEmptyHint: 'Add items with price, GST rate and stock.',

  // More
  businessProfile: 'Business profile',
  language: 'App language',
  account: 'Account',
  loggedInAs: 'Logged in as',
  logout: 'Logout',
  logoutConfirm: 'Logout from this phone? Your data stays saved on this phone.',
  appVersion: 'Version',
};

export type StringKey = keyof typeof en;

const hi: Record<StringKey, string> = {
  appName: 'GST Billing',
  tagline: 'Invoice Maker',
  taglineHindi: 'आपका हिसाब, आपके हाथ में',
  english: 'English',
  hinglish: 'Hinglish',
  cancel: 'Cancel',
  optional: 'zaroori nahi',
  yes: 'Haan',
  no: 'Nahi',
  comingSoon: 'Agle update mein aa raha hai',

  // Login
  loginTitle: 'Namaste 🙏',
  loginHint: 'Apne Google account se login karein. Password ki zaroorat nahi.',
  continueWithGoogle: 'Google se login karein',
  benefitFast: '30 second mein GST bill banayein',
  benefitOffline: 'Bina internet ke chalta hai',
  benefitSafe: 'Aapka data aapke phone mein safe',
  noInternet: 'Internet nahi hai. Connect karke dobara try karein.',
  noPlayServices: 'Is phone mein Google Play services nahi hai.',
  somethingWrong: 'Login nahi hua. Dobara try karein.',

  // Business setup
  setupTitle: 'Apna business set up karein',
  setupHint: 'Ye details aapke bill par dikhengi. Baad mein badal sakte hain.',
  sectionBusiness: 'Business ki details',
  sectionGst: 'GST details',
  sectionAddress: 'Pata',
  businessName: 'Business ka naam',
  businessNamePlaceholder: 'jaise Raja Refrigeration',
  mobile: 'Mobile number',
  gstRegistered: 'Kya aapka business GST registered hai?',
  gstin: 'GSTIN',
  gstinPlaceholder: '15 akshar ka GSTIN',
  gstinValid: 'GSTIN sahi hai — state aur PAN bhar diye',
  notGstHint: 'Koi baat nahi — bill phir bhi bana sakte hain (Bill of Supply).',
  pan: 'PAN',
  state: 'State',
  selectState: 'State chunein',
  searchState: 'State khojein',
  address: 'Dukaan / office ka pata',
  addressPlaceholder: 'Dukaan no., building, area',
  city: 'Shehar',
  pincode: 'Pincode',
  businessType: 'Business ka type',
  retail: 'Retail',
  wholesale: 'Wholesale',
  both: 'Dono',
  saveBusiness: 'Save karke billing shuru karein',

  errBusinessName: 'Business ka naam daalein',
  errMobile: 'Sahi 10 digit ka mobile number daalein',
  errGstin: 'Ye GSTIN sahi nahi hai. Check karein.',
  errState: 'State chunein',
  errPincode: 'Pincode 6 digit ka hona chahiye',
  errGstinState: 'GSTIN kisi aur state ka hai',

  // Tabs
  tabHome: 'Home',
  tabParties: 'Party',
  tabItems: 'Saaman',
  tabMore: 'Aur',

  // Home
  goodMorning: 'Suprabhat',
  goodAfternoon: 'Namaste',
  goodEvening: 'Shubh sandhya',
  toCollect: 'Lena hai',
  toPay: 'Dena hai',
  quickActions: 'Jaldi karein',
  newBill: 'Naya Bill',
  addParty: 'Party Jodein',
  addItem: 'Saaman Jodein',
  recentBills: 'Haal ke bill',
  noBillsYet: 'Abhi koi bill nahi',
  noBillsHint: 'Bill banate hi yahan dikhenge.',

  // Parties / Items
  partiesEmpty: 'Aapke customer aur supplier',
  partiesEmptyHint: 'Party jodein aur dekhein kisse lena hai, kisko dena hai.',
  itemsEmpty: 'Aapka saaman aur services',
  itemsEmptyHint: 'Saaman jodein — rate, GST aur stock ke saath.',

  // More
  businessProfile: 'Business profile',
  language: 'App ki bhasha',
  account: 'Account',
  loggedInAs: 'Login hai',
  logout: 'Logout',
  logoutConfirm: 'Is phone se logout karein? Aapka data isi phone par save rahega.',
  appVersion: 'Version',
};

export const STRINGS: Record<Language, Record<StringKey, string>> = { en, hi };
