/**
 * TeamFlow — One-time Setup Script
 * ────────────────────────────────────────────
 * วิธีใช้:
 *   1. เปิด Spreadsheet "Design Flow"
 *   2. Extensions → Apps Script
 *   3. วางไฟล์นี้ + Api.gs + Auth.gs ใน Project
 *   4. เลือก function `setupAll` → กด Run
 *   5. กด Authorize เมื่อขอ permission
 *   6. รอประมาณ 10 วินาที จนเห็น log "✅ Setup complete"
 *
 * รัน setupAll ซ้ำได้ — script จะ skip tab ที่มีอยู่แล้ว ไม่ลบข้อมูลเก่า
 */

const SCHEMA = {
  Users: [
    'email', 'name', 'role', 'dept',
    'pass_hash', 'added_by', 'added_at', 'active'
  ],
  Quotas: [
    'email', 'year', 'sick_used', 'personal_used', 'vacation_used',
    'dental_used', 'birthday_used', 'funeral_used', 'maternity_used',
    'training_used', 'sterilize_used', 'ordain_used', 'other_used'
  ],
  Audit_Log: [
    'timestamp', 'actor_email', 'action', 'target', 'details'
  ]
};

const LEAVE_HEADERS = [
  'id', 'email', 'name', 'type', 'start_date', 'end_date', 'days',
  'reason', 'status', 'doc_url', 'requested_at', 'reviewed_by', 'reviewed_at'
];

const EX_HEADERS = [
  'id', 'email', 'name', 'ex_type', 'duration_min',
  'participants', 'reward', 'status', 'submitted_at', 'approved_by'
];

const DEPTS = ['UXUI', 'Media', 'Art', 'Management'];

function setupAll() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('▶ Setup starting on: ' + ss.getName());

  // 1. Core tabs
  Object.entries(SCHEMA).forEach(([name, headers]) => {
    ensureSheet_(ss, name, headers);
  });

  // 2. Per-team Leaves & Exercises tabs
  DEPTS.forEach(dept => {
    ensureSheet_(ss, `Leaves_${dept}`, LEAVE_HEADERS);
    ensureSheet_(ss, `Exercises_${dept}`, EX_HEADERS);
  });

  // 3. Seed default admin users (CHANGE PASSWORDS BEFORE PROD!)
  seedDefaultUsers_(ss);

  // 4. Remove the default empty tab if present
  const defaultTab = ss.getSheetByName('ชีต1') || ss.getSheetByName('Sheet1');
  if (defaultTab && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultTab);
    Logger.log('🗑  Removed default tab');
  }

  // 5. Reorder tabs in a sensible way
  reorderTabs_(ss);

  Logger.log('✅ Setup complete — ' + ss.getSheets().length + ' tabs ready');

  // Show alert popup only if UI context is available (when run from a Sheet that's currently open)
  try {
    SpreadsheetApp.getUi().alert(
      '✅ TeamFlow Setup Complete',
      `${ss.getSheets().length} tabs สร้างเรียบร้อย\n\n` +
      'ขั้นตอนถัดไป:\n' +
      '1. เปลี่ยน password ของ default users ทันที\n' +
      '2. เพิ่มสมาชิกทีมจริงใน Users tab\n' +
      '3. Deploy เป็น Web App (Deploy → New deployment)',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (e) {
    Logger.log('ℹ️  Run from editor — popup skipped. Setup OK ✅');
  }
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    Logger.log('➕ Created tab: ' + name);
  } else {
    Logger.log('• Tab exists: ' + name);
  }

  // Set headers (only if row 1 empty)
  const firstRow = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  const isEmpty = firstRow.every(v => v === '' || v === null);
  if (isEmpty) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  // Format header row
  const headerRange = sh.getRange(1, 1, 1, headers.length);
  headerRange
    .setFontWeight('bold')
    .setBackground('#1e2029')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('left');
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, headers.length);
}

function seedDefaultUsers_(ss) {
  const sh = ss.getSheetByName('Users');
  const existing = sh.getDataRange().getValues();
  if (existing.length > 1) {
    Logger.log('• Users tab already has data, skipping seed');
    return;
  }
  const now = new Date();
  const seed = [
    ['pm@team.com',         'คุณ PM',           'pm',    'Management', hashPwd_('admin123'), 'system', now, true],
    ['lead.uxui@team.com',  'คุณหัวหน้า UXUI',  'lead', 'UXUI',       hashPwd_('lead123'),  'system', now, true],
    ['lead.media@team.com', 'คุณหัวหน้า Media', 'lead', 'Media',      hashPwd_('lead123'),  'system', now, true],
    ['lead.art@team.com',   'คุณหัวหน้า Art',   'lead', 'Art',        hashPwd_('lead123'),  'system', now, true]
  ];
  sh.getRange(2, 1, seed.length, seed[0].length).setValues(seed);
  Logger.log('🌱 Seeded ' + seed.length + ' default users');
}

function reorderTabs_(ss) {
  const order = [
    'Users', 'Quotas',
    'Leaves_UXUI', 'Leaves_Media', 'Leaves_Art', 'Leaves_Management',
    'Exercises_UXUI', 'Exercises_Media', 'Exercises_Art', 'Exercises_Management',
    'Audit_Log'
  ];
  order.forEach((name, i) => {
    const sh = ss.getSheetByName(name);
    if (sh) ss.setActiveSheet(sh), ss.moveActiveSheet(i + 1);
  });
}

/**
 * djb2 hash — เข้ากับ hp() ใน team-manager.js เดิม
 * ⚠️  ไม่ปลอดภัยพอสำหรับ prod — แนะนำเปลี่ยนไป Google Sign-In
 */
function hashPwd_(pwd) {
  let h = 5381;
  for (let i = 0; i < pwd.length; i++) {
    h = ((h << 5) + h) + pwd.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}
