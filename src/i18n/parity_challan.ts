// Delivery challan strings (parity batch, worker p2-challan).
// Coordinator merges these into src/i18n/strings.ts at integration.
// Shape: flat en + hi (Hinglish, Latin script), single-quoted, no braces.

export const en = {
  ch_menuTitle: 'Delivery Challans',
  ch_menuHint: 'Send goods out without a tax bill',
  ch_title: 'Delivery Challans',
  ch_search: 'Search challans',
  ch_newChallan: 'New Challan',
  ch_editChallan: 'Edit Challan',
  ch_saveChallan: 'Save Challan',
  ch_challanNo: 'Challan No.',
  ch_challanDate: 'Challan Date',
  ch_noGstNote: 'No GST on a challan. Goods move out of stock; no money is billed.',
  ch_noChallansYet: 'No challans yet',
  ch_noChallansHint: 'Raise a challan when goods go out before the bill.',
  ch_deliveryChallan: 'Delivery Challan',
  ch_convertToBill: 'Convert to Invoice',
  ch_convertedTo: 'Converted to bill',
  ch_alreadyConverted: 'This challan is already converted.',
  ch_cancelChallan: 'Cancel Challan',
  ch_cancelConfirm: 'Cancel this challan? The stock will come back in.',
  ch_cancelled: 'Challan cancelled.',
  ch_convertedMsg: 'Bill created from the challan.',
  ch_errDuplicateNo: 'This challan number is already used.',
  ch_totalQty: 'Total Qty',
  ch_convertedBadge: 'Converted',
};

export type ParityChallanKey = keyof typeof en;

export const hi: Record<ParityChallanKey, string> = {
  ch_menuTitle: 'Delivery Challan',
  ch_menuHint: 'Bina tax bill ke maal bhejein',
  ch_title: 'Delivery Challan',
  ch_search: 'Challan khojein',
  ch_newChallan: 'Naya Challan',
  ch_editChallan: 'Challan edit karein',
  ch_saveChallan: 'Challan save karein',
  ch_challanNo: 'Challan No.',
  ch_challanDate: 'Challan ki date',
  ch_noGstNote: 'Challan par koi GST nahi. Maal stock se nikal jayega, koi paisa bill nahi hoga.',
  ch_noChallansYet: 'Abhi koi challan nahi',
  ch_noChallansHint: 'Bill se pehle maal bhejne par challan banayein.',
  ch_deliveryChallan: 'Delivery Challan',
  ch_convertToBill: 'Bill me badlein',
  ch_convertedTo: 'Bill ban gaya',
  ch_alreadyConverted: 'Ye challan pehle hi convert ho chuka hai.',
  ch_cancelChallan: 'Challan cancel karein',
  ch_cancelConfirm: 'Ye challan cancel karein? Stock wapas aa jayega.',
  ch_cancelled: 'Challan cancel ho gaya.',
  ch_convertedMsg: 'Challan se bill ban gaya.',
  ch_errDuplicateNo: 'Ye challan number pehle se use ho raha hai.',
  ch_totalQty: 'Kul Qty',
  ch_convertedBadge: 'Convert ho gaya',
};
