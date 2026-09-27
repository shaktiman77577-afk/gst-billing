// Offline GST rate finder dataset.
//
// INDICATIVE RATES ONLY — verify on cbic.gov.in before billing.
// Compiled from the standard GST slabs (0 / 5 / 12 / 18 / 28) to the best of
// our knowledge (Sept 2026). Deliberately NOT covered here:
//   - the 40% slab (tobacco, pan masala, aerated/caffeinated drinks, luxury
//     cars, >350cc bikes, yachts, etc.)
//   - precious metals & jewellery (gold/silver 3%, diamonds 0.25%)
// A few entries share an HSN/SAC code with a different rate because GST itself
// keys the rate off the price or condition (e.g. garments above/below Rs 1,000,
// hotel rooms above/below Rs 7,500/day, coconut oil sold as food vs hair oil).
// Those rows are intentional — the description always states the condition.

export interface GstRateEntry {
  /** HSN (goods) or SAC (services) code. */
  hsn: string;
  /** Short English description of the item or service. */
  desc: string;
  /** GST rate % — always one of GST_SLABS. */
  rate: number;
  kind: 'goods' | 'service';
}

export const GST_SLABS = [0, 5, 12, 18, 28] as const;

/** Compact offline dataset of common HSN/SAC codes with GST rates. */
export const GST_RATES: GstRateEntry[] = [
  // ---------------------------------------------------------- groceries
  { hsn: '0401', desc: 'Fresh milk (unpackaged / loose)', rate: 0, kind: 'goods' },
  { hsn: '0402', desc: 'Milk powder / dairy whitener', rate: 5, kind: 'goods' },
  { hsn: '0403', desc: 'Curd, lassi, buttermilk (pre-packaged & labelled)', rate: 5, kind: 'goods' },
  { hsn: '0405', desc: 'Butter & ghee', rate: 12, kind: 'goods' },
  { hsn: '0406', desc: 'Cheese & paneer (pre-packaged & labelled)', rate: 12, kind: 'goods' },
  { hsn: '0407', desc: 'Eggs (fresh, in shell)', rate: 0, kind: 'goods' },
  { hsn: '0409', desc: 'Honey (branded, pre-packaged)', rate: 5, kind: 'goods' },
  { hsn: '0701', desc: 'Fresh vegetables (potato, onion, tomato etc.)', rate: 0, kind: 'goods' },
  { hsn: '0713', desc: 'Pulses / dal (pre-packaged & labelled)', rate: 5, kind: 'goods' },
  { hsn: '0801', desc: 'Coconuts (fresh)', rate: 0, kind: 'goods' },
  { hsn: '080111', desc: 'Desiccated coconut', rate: 12, kind: 'goods' },
  { hsn: '0802', desc: 'Cashew, almonds & other dried fruits', rate: 12, kind: 'goods' },
  { hsn: '0808', desc: 'Fresh fruits (apple, banana, mango etc.)', rate: 0, kind: 'goods' },
  { hsn: '0603', desc: 'Fresh flowers', rate: 0, kind: 'goods' },
  { hsn: '0201', desc: 'Fresh meat, chicken, fish', rate: 0, kind: 'goods' },
  { hsn: '0207', desc: 'Frozen chicken / meat', rate: 12, kind: 'goods' },
  { hsn: '1001', desc: 'Wheat (pre-packaged & labelled)', rate: 5, kind: 'goods' },
  { hsn: '1006', desc: 'Rice (pre-packaged & labelled)', rate: 5, kind: 'goods' },
  { hsn: '1101', desc: 'Wheat flour / atta (pre-packaged)', rate: 5, kind: 'goods' },
  { hsn: '1102', desc: 'Besan & other cereal flours (pre-packaged)', rate: 5, kind: 'goods' },
  { hsn: '1103', desc: 'Suji / rava (pre-packaged)', rate: 5, kind: 'goods' },
  { hsn: '1209', desc: 'Seeds for sowing', rate: 0, kind: 'goods' },
  { hsn: '1512', desc: 'Edible oils (mustard, sunflower, groundnut)', rate: 5, kind: 'goods' },
  { hsn: '1513', desc: 'Coconut oil (sold as edible oil)', rate: 5, kind: 'goods' },
  { hsn: '1513', desc: 'Coconut oil (sold as hair oil)', rate: 18, kind: 'goods' },
  { hsn: '1516', desc: 'Vanaspati / margarine', rate: 5, kind: 'goods' },
  { hsn: '1701', desc: 'Sugar & jaggery (gur)', rate: 5, kind: 'goods' },
  { hsn: '170410', desc: 'Chewing gum / bubble gum', rate: 18, kind: 'goods' },
  { hsn: '1806', desc: 'Chocolates & cocoa preparations', rate: 18, kind: 'goods' },
  { hsn: '1901', desc: 'Malted beverages (Horlicks, Bournvita etc.)', rate: 18, kind: 'goods' },
  { hsn: '190110', desc: 'Infant milk food', rate: 5, kind: 'goods' },
  { hsn: '1902', desc: 'Pasta, noodles, macaroni', rate: 18, kind: 'goods' },
  { hsn: '1904', desc: 'Cornflakes & breakfast cereals', rate: 18, kind: 'goods' },
  { hsn: '1905', desc: 'Bread', rate: 5, kind: 'goods' },
  { hsn: '190531', desc: 'Biscuits & cookies', rate: 18, kind: 'goods' },
  { hsn: '190590', desc: 'Cakes & pastries', rate: 18, kind: 'goods' },
  { hsn: '2001', desc: 'Pickles', rate: 12, kind: 'goods' },
  { hsn: '200520', desc: 'Potato chips / wafers', rate: 12, kind: 'goods' },
  { hsn: '2007', desc: 'Jams, jellies, marmalades', rate: 12, kind: 'goods' },
  { hsn: '2009', desc: 'Fruit juices (packed)', rate: 12, kind: 'goods' },
  { hsn: '2103', desc: 'Tomato ketchup & sauces', rate: 12, kind: 'goods' },
  { hsn: '2105', desc: 'Ice cream', rate: 18, kind: 'goods' },
  { hsn: '2106', desc: 'Namkeen, bhujia, mixtures (packed)', rate: 12, kind: 'goods' },
  { hsn: '210690', desc: 'Indian sweets (mithai)', rate: 5, kind: 'goods' },
  { hsn: '2201', desc: 'Packaged drinking water / mineral water', rate: 18, kind: 'goods' },
  { hsn: '2309', desc: 'Animal / poultry feed', rate: 5, kind: 'goods' },
  { hsn: '2501', desc: 'Salt (incl. table salt, pre-packaged)', rate: 5, kind: 'goods' },
  { hsn: '2505', desc: 'Sand', rate: 5, kind: 'goods' },
  { hsn: '0901', desc: 'Coffee (incl. instant coffee)', rate: 5, kind: 'goods' },
  { hsn: '0902', desc: 'Tea', rate: 5, kind: 'goods' },
  { hsn: '0904', desc: 'Spices - chilli, turmeric, coriander, cumin, pepper', rate: 5, kind: 'goods' },

  // ---------------------------------------------------------- medicines & personal care
  { hsn: '3004', desc: 'Medicines / drugs (formulations)', rate: 5, kind: 'goods' },
  { hsn: '300490', desc: 'Ayurvedic / herbal medicines', rate: 12, kind: 'goods' },
  { hsn: '3304', desc: 'Cosmetics - creams, lipstick, kajal, nail polish, talcum powder', rate: 18, kind: 'goods' },
  { hsn: '3305', desc: 'Shampoo, hair oil, hair colour & dye', rate: 18, kind: 'goods' },
  { hsn: '3306', desc: 'Toothpaste & mouthwash', rate: 18, kind: 'goods' },
  { hsn: '3307', desc: 'Deodorants, room fresheners, shaving cream', rate: 18, kind: 'goods' },
  { hsn: '330741', desc: 'Agarbatti / incense sticks', rate: 12, kind: 'goods' },
  { hsn: '3401', desc: 'Soap (bathing & laundry)', rate: 18, kind: 'goods' },
  { hsn: '3402', desc: 'Detergents, washing powder, toilet & floor cleaners', rate: 18, kind: 'goods' },
  { hsn: '3405', desc: 'Shoe polish & metal polishes', rate: 18, kind: 'goods' },
  { hsn: '3406', desc: 'Candles', rate: 12, kind: 'goods' },
  { hsn: '3604', desc: 'Firecrackers', rate: 18, kind: 'goods' },
  { hsn: '3605', desc: 'Safety matches', rate: 12, kind: 'goods' },
  { hsn: '3808', desc: 'Pesticides / insecticides', rate: 18, kind: 'goods' },
  { hsn: '380891', desc: 'Mosquito repellent coils, liquids & sprays', rate: 18, kind: 'goods' },
  { hsn: '380894', desc: 'Hand sanitizer / disinfectants', rate: 18, kind: 'goods' },
  { hsn: '8212', desc: 'Razors & blades', rate: 18, kind: 'goods' },
  { hsn: '8713', desc: 'Wheelchairs & crutches', rate: 5, kind: 'goods' },
  { hsn: '9018', desc: 'BP monitors & thermometers', rate: 12, kind: 'goods' },
  { hsn: '9619', desc: 'Sanitary napkins', rate: 0, kind: 'goods' },

  // ---------------------------------------------------------- garments, textiles & footwear
  { hsn: '5205', desc: 'Cotton yarn', rate: 5, kind: 'goods' },
  { hsn: '5208', desc: 'Cotton fabrics', rate: 5, kind: 'goods' },
  { hsn: '5407', desc: 'Synthetic / man-made fabrics', rate: 12, kind: 'goods' },
  { hsn: '6109', desc: 'Readymade garments (sale price up to Rs 1,000/pc)', rate: 5, kind: 'goods' },
  { hsn: '6115', desc: 'Socks & hosiery', rate: 5, kind: 'goods' },
  { hsn: '6203', desc: 'Readymade garments (sale price above Rs 1,000/pc)', rate: 12, kind: 'goods' },
  { hsn: '6301', desc: 'Blankets & quilts', rate: 12, kind: 'goods' },
  { hsn: '6302', desc: 'Bed sheets, towels & bed linen', rate: 12, kind: 'goods' },
  { hsn: '6303', desc: 'Curtains (textile)', rate: 12, kind: 'goods' },
  { hsn: '6403', desc: 'Footwear (up to Rs 1,000/pair)', rate: 5, kind: 'goods' },
  { hsn: '6404', desc: 'Footwear (above Rs 1,000/pair)', rate: 18, kind: 'goods' },
  { hsn: '6601', desc: 'Umbrellas', rate: 12, kind: 'goods' },
  { hsn: '4202', desc: 'Bags, suitcases, wallets & belts (leather / rexine)', rate: 18, kind: 'goods' },
  { hsn: '420292', desc: 'School bags', rate: 18, kind: 'goods' },
  { hsn: '5703', desc: 'Carpets & rugs', rate: 12, kind: 'goods' },
  { hsn: '6506', desc: 'Helmets', rate: 18, kind: 'goods' },
  { hsn: '7117', desc: 'Imitation / artificial jewellery', rate: 18, kind: 'goods' },

  // ---------------------------------------------------------- electronics & appliances
  { hsn: '8414', desc: 'Fans (ceiling, table, exhaust)', rate: 18, kind: 'goods' },
  { hsn: '8415', desc: 'Air conditioners', rate: 18, kind: 'goods' },
  { hsn: '8418', desc: 'Refrigerators', rate: 18, kind: 'goods' },
  { hsn: '8419', desc: 'Solar water heaters', rate: 12, kind: 'goods' },
  { hsn: '8421', desc: 'Water purifiers (RO)', rate: 18, kind: 'goods' },
  { hsn: '8423', desc: 'Weighing scales', rate: 18, kind: 'goods' },
  { hsn: '8424', desc: 'Fire extinguishers', rate: 18, kind: 'goods' },
  { hsn: '8450', desc: 'Washing machines', rate: 18, kind: 'goods' },
  { hsn: '8452', desc: 'Sewing machines', rate: 12, kind: 'goods' },
  { hsn: '8467', desc: 'Drill machines & power tools', rate: 18, kind: 'goods' },
  { hsn: '8470', desc: 'Calculators', rate: 18, kind: 'goods' },
  { hsn: '8471', desc: 'Laptops & desktop computers', rate: 18, kind: 'goods' },
  { hsn: '847160', desc: 'Keyboards & mouse', rate: 18, kind: 'goods' },
  { hsn: '8479', desc: 'Air coolers', rate: 18, kind: 'goods' },
  { hsn: '8443', desc: 'Printers', rate: 18, kind: 'goods' },
  { hsn: '8504', desc: 'Inverters / UPS', rate: 18, kind: 'goods' },
  { hsn: '8507', desc: 'Batteries (incl. inverter batteries)', rate: 18, kind: 'goods' },
  { hsn: '8508', desc: 'Vacuum cleaners', rate: 18, kind: 'goods' },
  { hsn: '8509', desc: 'Mixer grinder / juicer', rate: 18, kind: 'goods' },
  { hsn: '8510', desc: 'Shavers & trimmers', rate: 18, kind: 'goods' },
  { hsn: '8513', desc: 'Torch / flashlight', rate: 12, kind: 'goods' },
  { hsn: '8516', desc: 'Geyser, electric iron & microwave oven', rate: 18, kind: 'goods' },
  { hsn: '8517', desc: 'Mobile phones', rate: 18, kind: 'goods' },
  { hsn: '851762', desc: 'Wi-Fi routers / modems', rate: 18, kind: 'goods' },
  { hsn: '8518', desc: 'Speakers / home theatre', rate: 18, kind: 'goods' },
  { hsn: '8523', desc: 'Memory cards & pen drives', rate: 18, kind: 'goods' },
  { hsn: '8525', desc: 'CCTV cameras', rate: 18, kind: 'goods' },
  { hsn: '8528', desc: 'TV (LED / LCD)', rate: 18, kind: 'goods' },
  { hsn: '852852', desc: 'Computer monitors', rate: 18, kind: 'goods' },
  { hsn: '8536', desc: 'Electrical switches & sockets', rate: 18, kind: 'goods' },
  { hsn: '8541', desc: 'Solar panels / modules', rate: 12, kind: 'goods' },
  { hsn: '8544', desc: 'Electrical wires & cables', rate: 18, kind: 'goods' },
  { hsn: '9004', desc: 'Sunglasses', rate: 18, kind: 'goods' },
  { hsn: '9102', desc: 'Watches (incl. smartwatches)', rate: 18, kind: 'goods' },
  { hsn: '9405', desc: 'LED bulbs & tube lights', rate: 12, kind: 'goods' },

  // ---------------------------------------------------------- vehicles
  { hsn: '8703', desc: 'Small cars (petrol up to 1200cc / diesel up to 1500cc, length up to 4m)', rate: 18, kind: 'goods' },
  { hsn: '870380', desc: 'Electric vehicles (EV)', rate: 5, kind: 'goods' },
  { hsn: '8711', desc: 'Two-wheelers - scooter / bike (engine up to 350cc)', rate: 18, kind: 'goods' },
  { hsn: '8712', desc: 'Bicycles', rate: 12, kind: 'goods' },
  { hsn: '4011', desc: 'Rubber tyres (motor vehicles)', rate: 18, kind: 'goods' },
  { hsn: '2710', desc: 'Lubricating oils / engine oil', rate: 18, kind: 'goods' },
  { hsn: '2711', desc: 'LPG (domestic cylinder)', rate: 5, kind: 'goods' },
  { hsn: '271111', desc: 'CNG / PNG (natural gas)', rate: 5, kind: 'goods' },
  { hsn: '2701', desc: 'Coal', rate: 5, kind: 'goods' },

  // ---------------------------------------------------------- home, building & agriculture
  { hsn: '2523', desc: 'Cement', rate: 18, kind: 'goods' },
  { hsn: '3105', desc: 'Fertilizers (urea, DAP etc.)', rate: 5, kind: 'goods' },
  { hsn: '3208', desc: 'Paints, varnishes & primers', rate: 18, kind: 'goods' },
  { hsn: '3214', desc: 'Wall putty', rate: 18, kind: 'goods' },
  { hsn: '3506', desc: 'Adhesives (Fevicol etc.)', rate: 18, kind: 'goods' },
  { hsn: '3917', desc: 'PVC pipes & fittings', rate: 18, kind: 'goods' },
  { hsn: '3923', desc: 'Garbage bags / plastic sacks', rate: 18, kind: 'goods' },
  { hsn: '3924', desc: 'Plastic water bottles & lunch boxes', rate: 18, kind: 'goods' },
  { hsn: '392490', desc: 'Plastic buckets, tubs, mugs & dustbins', rate: 18, kind: 'goods' },
  { hsn: '3925', desc: 'Plastic water tanks', rate: 18, kind: 'goods' },
  { hsn: '4412', desc: 'Plywood & laminates', rate: 18, kind: 'goods' },
  { hsn: '4814', desc: 'Wallpaper', rate: 18, kind: 'goods' },
  { hsn: '4818', desc: 'Tissue paper, napkins & toilet paper', rate: 18, kind: 'goods' },
  { hsn: '4820', desc: 'Notebooks, exercise books & registers', rate: 12, kind: 'goods' },
  { hsn: '4901', desc: 'Printed books', rate: 0, kind: 'goods' },
  { hsn: '6901', desc: 'Bricks (incl. fly ash bricks)', rate: 12, kind: 'goods' },
  { hsn: '6907', desc: 'Ceramic tiles', rate: 18, kind: 'goods' },
  { hsn: '6910', desc: 'Sanitaryware (WC, wash basin)', rate: 18, kind: 'goods' },
  { hsn: '7208', desc: 'Iron & steel (bars, rods, sheets)', rate: 18, kind: 'goods' },
  { hsn: '7321', desc: 'LPG stoves / gas burners', rate: 18, kind: 'goods' },
  { hsn: '7323', desc: 'Steel utensils & kitchenware', rate: 18, kind: 'goods' },
  { hsn: '7607', desc: 'Aluminium foil', rate: 18, kind: 'goods' },
  { hsn: '7615', desc: 'Pressure cookers', rate: 12, kind: 'goods' },
  { hsn: '8301', desc: 'Locks & padlocks', rate: 18, kind: 'goods' },
  { hsn: '8481', desc: 'Taps, faucets & valves', rate: 18, kind: 'goods' },
  { hsn: '9401', desc: 'Sofas & chairs', rate: 18, kind: 'goods' },
  { hsn: '9403', desc: 'Furniture - beds, tables, almirahs (wooden / steel)', rate: 18, kind: 'goods' },
  { hsn: '9404', desc: 'Mattresses & pillows', rate: 18, kind: 'goods' },
  { hsn: '9503', desc: 'Toys', rate: 12, kind: 'goods' },
  { hsn: '9506', desc: 'Sports goods', rate: 12, kind: 'goods' },
  { hsn: '9603', desc: 'Paint brushes & rollers', rate: 18, kind: 'goods' },
  { hsn: '9608', desc: 'Ball pens', rate: 18, kind: 'goods' },
  { hsn: '9609', desc: 'Pencils & crayons', rate: 12, kind: 'goods' },

  // ---------------------------------------------------------- services (SAC)
  { hsn: '9963', desc: 'Restaurant food & beverages (standalone; outdoor catering)', rate: 5, kind: 'service' },
  { hsn: '9963', desc: 'Restaurant in hotel - specified premises (room tariff above Rs 7,500/day)', rate: 18, kind: 'service' },
  { hsn: '9963', desc: 'Hotel room (tariff up to Rs 7,500/day)', rate: 12, kind: 'service' },
  { hsn: '9963', desc: 'Hotel room (tariff above Rs 7,500/day)', rate: 18, kind: 'service' },
  { hsn: '9963', desc: 'Food delivery (restaurant food via app)', rate: 5, kind: 'service' },
  { hsn: '9964', desc: 'Taxi / cab services', rate: 5, kind: 'service' },
  { hsn: '9964', desc: 'Air travel (economy class)', rate: 5, kind: 'service' },
  { hsn: '9964', desc: 'Air travel (business class)', rate: 12, kind: 'service' },
  { hsn: '9964', desc: 'Tour operator packages', rate: 5, kind: 'service' },
  { hsn: '9964', desc: 'Car rental with driver', rate: 5, kind: 'service' },
  { hsn: '9965', desc: 'Goods transport by road (GTA)', rate: 5, kind: 'service' },
  { hsn: '9965', desc: 'Rail freight (goods)', rate: 5, kind: 'service' },
  { hsn: '9968', desc: 'Courier services', rate: 18, kind: 'service' },
  { hsn: '9969', desc: 'Packers & movers', rate: 18, kind: 'service' },
  { hsn: '9969', desc: 'Warehousing / godown rent', rate: 18, kind: 'service' },
  { hsn: '9971', desc: 'Banking & financial services', rate: 18, kind: 'service' },
  { hsn: '9971', desc: 'Individual life insurance premium', rate: 0, kind: 'service' },
  { hsn: '9971', desc: 'Individual health insurance premium', rate: 0, kind: 'service' },
  { hsn: '9971', desc: 'Motor / general insurance premium', rate: 18, kind: 'service' },
  { hsn: '9972', desc: 'Commercial property rent', rate: 18, kind: 'service' },
  { hsn: '9972', desc: 'Residential house rent', rate: 0, kind: 'service' },
  { hsn: '9972', desc: 'Real estate brokerage / commission', rate: 18, kind: 'service' },
  { hsn: '9982', desc: 'CA / audit / accounting / GST filing services', rate: 18, kind: 'service' },
  { hsn: '9982', desc: 'Legal services (advocate)', rate: 18, kind: 'service' },
  { hsn: '9983', desc: 'IT / software / website & app development', rate: 18, kind: 'service' },
  { hsn: '9983', desc: 'Advertising services (incl. hoardings, digital)', rate: 18, kind: 'service' },
  { hsn: '9983', desc: 'Photography / videography', rate: 18, kind: 'service' },
  { hsn: '9983', desc: 'Event management', rate: 18, kind: 'service' },
  { hsn: '9983', desc: 'Web hosting / cloud services', rate: 18, kind: 'service' },
  { hsn: '9983', desc: 'Interior design services', rate: 18, kind: 'service' },
  { hsn: '9984', desc: 'Mobile / telecom services', rate: 18, kind: 'service' },
  { hsn: '9984', desc: 'Internet / broadband services', rate: 18, kind: 'service' },
  { hsn: '9984', desc: 'DTH / cable TV subscription', rate: 18, kind: 'service' },
  { hsn: '9985', desc: 'Manpower supply / staffing', rate: 18, kind: 'service' },
  { hsn: '9987', desc: 'Repair & maintenance / AMC (appliances, mobile, laptop)', rate: 18, kind: 'service' },
  { hsn: '9987', desc: 'Plumbing / electrician services', rate: 18, kind: 'service' },
  { hsn: '9988', desc: 'Job work on goods', rate: 12, kind: 'service' },
  { hsn: '9989', desc: 'Printing services (bill books, cards, pamphlets)', rate: 18, kind: 'service' },
  { hsn: '9989', desc: 'Photocopy / xerox, scanning & binding', rate: 18, kind: 'service' },
  { hsn: '9992', desc: 'School / college education', rate: 0, kind: 'service' },
  { hsn: '9992', desc: 'Coaching / tuition (commercial)', rate: 18, kind: 'service' },
  { hsn: '9993', desc: 'Hospital / healthcare services', rate: 0, kind: 'service' },
  { hsn: '9996', desc: 'Cinema tickets (up to Rs 100)', rate: 12, kind: 'service' },
  { hsn: '9996', desc: 'Cinema tickets (above Rs 100)', rate: 18, kind: 'service' },
  { hsn: '9996', desc: 'Amusement / water parks', rate: 18, kind: 'service' },
  { hsn: '9996', desc: 'Banquet / marriage hall', rate: 18, kind: 'service' },
  { hsn: '9997', desc: 'Beauty parlour / salon', rate: 18, kind: 'service' },
  { hsn: '9997', desc: 'Dry cleaning / laundry', rate: 18, kind: 'service' },
  { hsn: '9997', desc: 'Gym / fitness centre', rate: 18, kind: 'service' },
];

/**
 * Offline full-text search over the dataset. Every whitespace-separated word
 * must match either the HSN/SAC code or the description. Results are ranked:
 * HSN prefix match > word prefix in description > substring match.
 */
export function searchGstRates(query: string): GstRateEntry[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return GST_RATES;
  const scored: { e: GstRateEntry; s: number }[] = [];
  for (const e of GST_RATES) {
    const h = e.hsn.toLowerCase();
    const d = e.desc.toLowerCase();
    const tokens = d.split(/[^a-z0-9]+/);
    let score = 0;
    let ok = true;
    for (const w of words) {
      if (h.startsWith(w)) score += 3;
      else if (tokens.some((t) => t.startsWith(w))) score += 2;
      else if (h.includes(w) || d.includes(w)) score += 1;
      else {
        ok = false;
        break;
      }
    }
    if (ok) scored.push({ e, s: score });
  }
  scored.sort((a, b) => b.s - a.s || a.e.hsn.localeCompare(b.e.hsn));
  return scored.map((x) => x.e);
}
