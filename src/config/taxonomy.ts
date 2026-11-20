/**
 * Campus taxonomy: who fixes what, and where things are.
 *
 * ⚠️  This is a starting point. Finalise it with the administration before launch:
 *     categories should map to the team that actually fixes the problem, not to committee names.
 *
 * Edit this file and run `npm run db:seed`. Seeding upserts by slug and deactivates anything
 * removed from this file (existing issues keep their history).
 */

export type DepartmentSeed = {
  slug: string;
  name: string;
  email?: string;
  isSensitive?: boolean;
};

export type CategorySeed = {
  slug: string;
  name: string;
  department: string;
  /** Tell the classifier what belongs here and, just as important, what doesn't. */
  description: string;
  requiresLocation: boolean;
  subcategories: Array<{ slug: string; name: string }>;
};

export type LocationSeed = { slug: string; name: string; aliases: string[] };

export const departmentSeeds: DepartmentSeed[] = [
  { slug: 'estate', name: 'Estate & Maintenance' },
  { slug: 'it', name: 'IT Services' },
  { slug: 'hostel', name: 'Hostel Office' },
  { slug: 'mess', name: 'Mess & Cafeteria Committee' },
  { slug: 'academic', name: 'Academic Office' },
  { slug: 'placement', name: 'Placement Cell' },
  { slug: 'sports', name: 'Sports Committee' },
  { slug: 'security', name: 'Campus Security' },
  { slug: 'health', name: 'Medical Centre' },
  { slug: 'student-affairs', name: 'Student Affairs' },
  { slug: 'grievance', name: 'Grievance & Anti-Ragging Committee', isSensitive: true },
];

/** The category every sensitive report is routed to, whatever else it looks like. */
export const SENSITIVE_CATEGORY_SLUG = 'grievance';

/** "Somewhere else": requires a free-text location detail. */
export const OTHER_LOCATION_SLUG = 'elsewhere';

export const categorySeeds: CategorySeed[] = [
  {
    slug: 'maintenance',
    name: 'Maintenance & Repairs',
    department: 'estate',
    description:
      'Broken or faulty physical infrastructure anywhere on campus, including classrooms and hostels: electricity, lights, fans, AC, plumbing, water leaks, water supply, doors, windows, furniture, lifts, projectors and classroom equipment. NOT Wi-Fi/computers (IT) and NOT cleanliness (Housekeeping).',
    requiresLocation: true,
    subcategories: [
      { slug: 'electrical', name: 'Electricity / lights / fans' },
      { slug: 'ac', name: 'Air conditioning' },
      { slug: 'plumbing', name: 'Plumbing / water leak' },
      { slug: 'water-supply', name: 'Water supply / drinking water' },
      { slug: 'furniture', name: 'Furniture / doors / windows' },
      { slug: 'classroom-equipment', name: 'Projector / classroom equipment' },
      { slug: 'lift', name: 'Lift' },
      { slug: 'other', name: 'Other repair' },
    ],
  },
  {
    slug: 'housekeeping',
    name: 'Cleanliness & Housekeeping',
    department: 'estate',
    description:
      'Dirty or unhygienic common areas, washrooms, garbage not collected, pests (rats, cockroaches, mosquitoes), stray animals. NOT food hygiene in the mess (Mess & Cafeteria).',
    requiresLocation: true,
    subcategories: [
      { slug: 'washrooms', name: 'Washrooms' },
      { slug: 'garbage', name: 'Garbage / waste' },
      { slug: 'pests', name: 'Pests / mosquitoes' },
      { slug: 'common-areas', name: 'Common areas' },
      { slug: 'animals', name: 'Stray animals' },
    ],
  },
  {
    slug: 'it',
    name: 'Wi-Fi & IT',
    department: 'it',
    description:
      'Wi-Fi or internet problems, campus portal / LMS / email login, lab computers, printers, software licences. Wi-Fi in a hostel is still IT, not Hostel.',
    requiresLocation: false,
    subcategories: [
      { slug: 'wifi', name: 'Wi-Fi / internet' },
      { slug: 'portal', name: 'Portal / LMS / email account' },
      { slug: 'lab-computers', name: 'Lab computers' },
      { slug: 'printing', name: 'Printers / printing' },
      { slug: 'software', name: 'Software / licences' },
    ],
  },
  {
    slug: 'hostel',
    name: 'Hostel Administration',
    department: 'hostel',
    description:
      'Hostel administration and living arrangements: room allocation or change, roommate issues, hostel rules and timings, laundry, warden availability, visitor rules. NOT repairs in a hostel room (Maintenance) and NOT Wi-Fi (IT).',
    requiresLocation: true,
    subcategories: [
      { slug: 'allocation', name: 'Room allocation / change' },
      { slug: 'rules-timings', name: 'Rules / timings' },
      { slug: 'laundry', name: 'Laundry' },
      { slug: 'roommate', name: 'Roommate issue' },
      { slug: 'warden', name: 'Warden / hostel office' },
    ],
  },
  {
    slug: 'mess',
    name: 'Mess & Cafeteria',
    department: 'mess',
    description:
      'Food quality or taste, food hygiene (hair/insects in food, dirty plates), mess timings, menu, pricing at the cafeteria or canteen, staff behaviour at food outlets.',
    requiresLocation: true,
    subcategories: [
      { slug: 'food-quality', name: 'Food quality / taste' },
      { slug: 'food-hygiene', name: 'Food hygiene' },
      { slug: 'timings-menu', name: 'Timings / menu' },
      { slug: 'pricing', name: 'Pricing / billing' },
      { slug: 'staff', name: 'Staff behaviour' },
    ],
  },
  {
    slug: 'academic',
    name: 'Academics',
    department: 'academic',
    description:
      'Timetable and scheduling, exams and exam clashes, grades and results, attendance, courses and registration, faculty not turning up or teaching concerns. A broken projector in a classroom is Maintenance, not Academics.',
    requiresLocation: false,
    subcategories: [
      { slug: 'timetable', name: 'Timetable / scheduling' },
      { slug: 'exams', name: 'Exams' },
      { slug: 'grades', name: 'Grades / results' },
      { slug: 'attendance', name: 'Attendance' },
      { slug: 'courses', name: 'Courses / registration' },
      { slug: 'faculty', name: 'Faculty / teaching' },
    ],
  },
  {
    slug: 'placement',
    name: 'Placements & Internships',
    department: 'placement',
    description: 'Internships, placements, company drives, interview scheduling, offer letters, the placement portal.',
    requiresLocation: false,
    subcategories: [
      { slug: 'internships', name: 'Internships' },
      { slug: 'placements', name: 'Placements / company drives' },
      { slug: 'interviews', name: 'Interview scheduling' },
    ],
  },
  {
    slug: 'sports',
    name: 'Sports',
    department: 'sports',
    description: 'Sports equipment, courts, grounds, gym, booking of sports facilities, sports events.',
    requiresLocation: true,
    subcategories: [
      { slug: 'equipment', name: 'Equipment' },
      { slug: 'facilities', name: 'Courts / grounds / gym' },
      { slug: 'booking', name: 'Booking / availability' },
    ],
  },
  {
    slug: 'security',
    name: 'Safety & Security',
    department: 'security',
    description:
      'Theft, lost and found, suspicious people, unsafe areas (dark paths, broken boundary walls), gate and entry problems, vehicles and parking, fire safety. Harassment or threats against a person go to Grievance instead.',
    requiresLocation: true,
    subcategories: [
      { slug: 'theft', name: 'Theft / lost & found' },
      { slug: 'unsafe-area', name: 'Unsafe area / lighting' },
      { slug: 'entry', name: 'Gate / entry' },
      { slug: 'parking', name: 'Vehicles / parking' },
      { slug: 'fire', name: 'Fire safety' },
    ],
  },
  {
    slug: 'health',
    name: 'Health & Medical',
    department: 'health',
    description: 'Medical centre availability, medicines, ambulance, doctor timings, first aid. Mental health support requests also belong here unless they involve harassment.',
    requiresLocation: false,
    subcategories: [
      { slug: 'medical-centre', name: 'Medical centre / doctor' },
      { slug: 'medicines', name: 'Medicines / first aid' },
      { slug: 'mental-health', name: 'Counselling / mental health' },
    ],
  },
  {
    slug: SENSITIVE_CATEGORY_SLUG,
    name: 'Grievance / Harassment / Ragging',
    department: 'grievance',
    description:
      'Ragging, harassment (including sexual harassment), bullying, threats, discrimination, abuse of power by staff or students, or anything a student wants handled confidentially by the grievance committee.',
    requiresLocation: false,
    subcategories: [
      { slug: 'ragging', name: 'Ragging' },
      { slug: 'harassment', name: 'Harassment' },
      { slug: 'bullying', name: 'Bullying / threats' },
      { slug: 'discrimination', name: 'Discrimination' },
      { slug: 'other', name: 'Other grievance' },
    ],
  },
  {
    slug: 'other',
    name: 'Other',
    department: 'student-affairs',
    description: 'Anything that clearly does not fit another category: suggestions, events, general administration, transport.',
    requiresLocation: false,
    subcategories: [
      { slug: 'suggestion', name: 'Suggestion' },
      { slug: 'transport', name: 'Transport' },
      { slug: 'general', name: 'General' },
    ],
  },
];

// TODO(campus): replace with the real building names students use.
export const locationSeeds: LocationSeed[] = [
  { slug: 'hostel-a', name: 'Hostel A', aliases: ['H-A', 'hostel block a', 'a block hostel'] },
  { slug: 'hostel-b', name: 'Hostel B', aliases: ['H-B', 'hostel block b', 'b block hostel'] },
  { slug: 'hostel-c', name: 'Hostel C', aliases: ['H-C', 'hostel block c'] },
  { slug: 'girls-hostel', name: "Girls' Hostel", aliases: ['GH', 'ladies hostel', 'women hostel'] },
  { slug: 'mess', name: 'Mess', aliases: ['dining hall', 'hostel mess'] },
  { slug: 'cafeteria', name: 'Main Cafeteria', aliases: ['cafe', 'canteen', 'food court'] },
  { slug: 'library', name: 'Library', aliases: ['resource centre', 'RC', 'reading room'] },
  { slug: 'lecture-theatre', name: 'Lecture Theatre Complex', aliases: ['LT', 'LT complex', 'lecture hall'] },
  { slug: 'academic-block', name: 'Academic Block', aliases: ['classroom block', 'CEP', 'faculty block'] },
  { slug: 'lab-block', name: 'Lab Block', aliases: ['labs', 'computer lab', 'lab building'] },
  { slug: 'admin-block', name: 'Admin Block', aliases: ['administration', 'accounts office', 'registrar office'] },
  { slug: 'sports-complex', name: 'Sports Complex', aliases: ['ground', 'court', 'gym', 'sports ground', 'SAC'] },
  { slug: 'medical-centre', name: 'Medical Centre', aliases: ['health centre', 'dispensary', 'infirmary'] },
  { slug: 'main-gate', name: 'Main Gate', aliases: ['gate', 'entrance', 'security gate'] },
  { slug: 'parking', name: 'Parking', aliases: ['parking lot', 'bike parking'] },
  { slug: 'campus-roads', name: 'Campus roads & paths', aliases: ['road', 'pathway', 'walkway'] },
  // Picked by students when their place isn't listed. Never offered to the classifier.
  { slug: OTHER_LOCATION_SLUG, name: 'Somewhere else (describe below)', aliases: [] },
];
