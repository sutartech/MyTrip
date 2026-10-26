/**
 * MyTrip Google Apps Script backend — Version 4.32.2
 * ------------------------------------------------
 * One global Administrator username and password opens every trip.
 * Every trip may keep a separate shared-trip password for legacy access.
 * A named traveller uses the permanent Traveller ID as username and one
 * personal password to open every trip that the
 * Administrator assigns to that traveller.
 *
 * Run setupMyTrip() once after pasting this version. It safely adds the new
 * security columns to an existing MyTrip spreadsheet without deleting data.
 * Existing Administrator credentials remain valid; setupMyTrip() gives that
 * account the default username "administrator" when no username exists yet.
 */

/**
 * RUN ALL — the only function you need for a fresh install or an upgrade.
 *
 * Select runAll in the Apps Script editor and click Run. It performs, in order:
 *   1. setupMyTrip()                      creates/upgrades every sheet and column
 *   2. repairMyTripSpreadsheet()          restores any missing column or header
 *   3. generateMyTripAdministratorLogin() only when no Administrator password exists
 *   4. testMyTripBackend()                end-to-end self test
 *   5. listMyTripActions()                prints every supported action
 *
 * Nothing is deleted and an existing Administrator login is never replaced.
 * Copy any generated USERNAME and TEMPORARY PASSWORD from the Execution log,
 * then deploy a New version and paste the /exec URL into config.js.
 */
function runAll() {
  const steps = [];
  function step(name, work) {
    try { const value = work(); steps.push({ step: name, ok: true }); return value; }
    catch (error) { steps.push({ step: name, ok: false, error: error.message || String(error) }); console.error(name + ' failed: ' + (error.message || error)); return null; }
  }

  console.log('MYTRIP RUN ALL — starting');
  const setup = step('setupMyTrip', setupMyTrip);
  const repair = step('repairMyTripSpreadsheet', repairMyTripSpreadsheet);

  let login = null;
  if (!getGlobalAdminHash()) {
    login = step('generateMyTripAdministratorLogin', generateMyTripAdministratorLogin);
  } else {
    steps.push({ step: 'generateMyTripAdministratorLogin', ok: true, skipped: 'An Administrator password already exists and was kept.' });
    console.log('Administrator login already configured — existing credentials were kept.');
  }

  step('removeDuplicateRows', removeDuplicateRows);
  step('installNightlyBackup', installNightlyBackup);
  const test = step('testMyTripBackend', testMyTripBackend);
  const actions = step('listMyTripActions', listMyTripActions) || [];

  const failed = steps.filter(function(item) { return !item.ok; });
  console.log('MYTRIP RUN ALL — finished');
  steps.forEach(function(item) { console.log((item.ok ? ' OK   ' : ' FAIL ') + item.step + (item.skipped ? ' — ' + item.skipped : '') + (item.error ? ' — ' + item.error : '')); });
  if (setup && setup.spreadsheetUrl) console.log('Spreadsheet: ' + setup.spreadsheetUrl);
  if (login && login.username) {
    console.log('NEW ADMINISTRATOR USERNAME: ' + login.username);
    console.log('TEMPORARY PASSWORD: ' + login.temporaryPassword);
    console.log('Sign in with these, then use Change login on the Administrator dashboard.');
  }
  console.log(failed.length
    ? 'Some steps failed. Fix the errors above and run runAll() again.'
    : 'All steps passed. Next: Deploy > Manage deployments > New version, then paste the /exec URL into config.js.');

  return {
    version: MYTRIP.version,
    ready: failed.length === 0 && Boolean(test && test.ready),
    steps: steps,
    spreadsheetUrl: setup ? setup.spreadsheetUrl : (repair ? repair.spreadsheetUrl : ''),
    administratorLogin: login,
    actionCount: actions.length
  };
}

/** Alias so RUNALL, runall or setupEverything all work. */
function RUNALL() { return runAll(); }
function setupEverything() { return runAll(); }


const MYTRIP = Object.freeze({
  spreadsheetProperty: 'MYTRIP_SPREADSHEET_ID',
  globalAdminHashProperty: 'MYTRIP_GLOBAL_ADMIN_HASH',
  globalAdminUsernameProperty: 'MYTRIP_GLOBAL_ADMIN_USERNAME',
  globalAdminEmailProperty: 'MYTRIP_GLOBAL_ADMIN_EMAIL',
  globalAdminPhoneProperty: 'MYTRIP_GLOBAL_ADMIN_PHONE',
  globalAdminOtpEnabledProperty: 'MYTRIP_GLOBAL_ADMIN_OTP_ENABLED',
  globalAdminEmailVerifiedProperty: 'MYTRIP_GLOBAL_ADMIN_EMAIL_VERIFIED_AT',
  rootFolderProperty: 'MYTRIP_ROOT_FOLDER_ID',
  stickyAccessMigrationProperty: 'MYTRIP_STICKY_ACCESS_MIGRATED_V1',
  idleMinutesProperty: 'MYTRIP_IDLE_SIGNOUT_MINUTES',
  adminPhotoProperty: 'MYTRIP_ADMIN_PHOTO_URL',
  adminPhotoFileProperty: 'MYTRIP_ADMIN_PHOTO_FILE',
  idleMinuteChoices: [5, 30, 60, 120],
  temporaryAdminResetProperty: 'MYTRIP_NEW_ADMIN_SECRET',
  temporaryAdminUsernameResetProperty: 'MYTRIP_NEW_ADMIN_USERNAME',
  version: '4.32.2',
  roles: { administrator: 'administrator', traveller: 'traveller' },
  sheets: {
    Trips: ['tripId', 'name', 'destination', 'startDate', 'endDate', 'budget', 'currency', 'photoUrl', 'photoFileId', 'photoUploadsEnabled', 'enabled', 'listHidden', 'listOrder', 'splitMembers', 'settleVisible', 'stickyHidden', 'altCurrency', 'altRate', 'inviteCode', 'inviteExpires', 'inviteRole', 'accessHash', 'adminHash', 'travellerHash', 'createdBy', 'createdByTravellerId', 'createdAt', 'updatedAt', 'photoAlbumUrl', 'announcementEnabled', 'announcementText', 'announcementStyle', 'announcementStart', 'announcementEnd', 'announcementSpeed', 'ratingRequired', 'ratingGraceDays'],
    Members: ['id', 'tripId', 'travellerId', 'name', 'role', 'createdAt'],
    Feedback: ['id', 'tripId', 'userKey', 'name', 'role', 'overall', 'itinerary', 'expenses', 'sticky', 'photos', 'suggestion', 'createdAt', 'updatedAt'],
    TravellerAccounts: ['travellerId', 'name', 'phone', 'email', 'otpEnabled', 'emailVerifiedAt', 'city', 'emergencyContact', 'notes', 'pinHash', 'active', 'canCreateTrips', 'tripCreationLimit', 'photoUrl', 'photoFileId', 'plan', 'planExpires', 'planSource', 'ratingDowngradedTripId', 'createdAt', 'updatedAt'],
    TripAssignments: ['id', 'tripId', 'travellerId', 'role', 'canViewItinerary', 'canViewExperiences', 'canViewPlaces', 'canViewExpenses', 'canViewTravellers', 'canPrint', 'canWriteStickyNotes', 'stickyNoteAccess', 'itineraryAccess', 'experienceAccess', 'placesAccess', 'expenseAccess', 'travellersAccess', 'printAccess', 'photoLimit', 'photoQuality', 'createdAt'],
    Places: ['id', 'tripId', 'name', 'area', 'category', 'plannedDay', 'notes', 'createdBy', 'createdAt','createdByAccount'],
    Itinerary: ['id', 'tripId', 'date', 'time', 'title', 'place', 'notes', 'category', 'status', 'bookingRef', 'cost', 'sortOrder', 'createdBy', 'createdAt', 'photoUrl','createdByAccount'],
    ExperienceNotes: ['id', 'tripId', 'date', 'place', 'note', 'writer', 'visibility', 'photoUrl', 'noteType', 'createdAt', 'updatedAt','createdByAccount'],
    TripPhotos: ['id', 'tripId', 'fileId', 'photoUrl', 'caption', 'uploadedBy', 'uploaderId', 'createdAt', 'updatedAt'],
    StickyNoteDiary: ['id', 'tripId', 'type', 'title', 'details', 'dueDate', 'colour', 'createdAt', 'completedAt', 'completedBy'],
    StickyNotes: ['id', 'tripId', 'type', 'title', 'details', 'dueDate', 'colour', 'pinned', 'x', 'y', 'width', 'height', 'createdBy', 'createdAt', 'updatedBy', 'updatedAt'],
    Expenses: ['id', 'tripId', 'date', 'label', 'category', 'paidBy', 'amount', 'notes', 'createdBy', 'createdAt', 'receiptUrl', 'receiptFileId', 'sharedBy', 'currency', 'foreignAmount', 'fxRate', 'source', 'quickPassId','createdByAccount'],
    QuickExpensePasses: ['id', 'tripId', 'travellerId', 'tokenHash', 'enabled', 'activeFrom', 'expiresAt', 'dailyLimit', 'editMinutes', 'allowEdit', 'recentLimit', 'allowAnyPayer', 'usageDate', 'usageCount', 'createdAt', 'createdBy', 'updatedAt', 'lastUsedAt'],
    Settlements: ['id', 'tripId', 'fromPerson', 'toPerson', 'amount', 'note', 'settledBy', 'createdAt', 'method', 'paidOn', 'reference'],
    JoinRequests: ['id', 'tripId', 'travellerId', 'name', 'phone', 'status', 'createdAt', 'decidedAt'],
    Checklist: ['id', 'tripId', 'text', 'assignee', 'day', 'done', 'doneBy', 'createdBy', 'createdAt', 'updatedAt'],
    Activity: ['id', 'tripId', 'action', 'details', 'createdBy', 'createdAt'],
    AccessLog: ['id', 'tripId', 'accountId', 'accountName', 'role', 'event', 'method', 'success', 'details', 'deviceType', 'browser', 'operatingSystem', 'timezone', 'language', 'screen', 'sessionId', 'linkPassId', 'createdAt']
  }
});
const MYTRIP_PHOTO_MAX_BYTES_ = 20 * 1024 * 1024;
const MYTRIP_PHOTO_MAX_BASE64_ = Math.ceil(MYTRIP_PHOTO_MAX_BYTES_ / 3) * 4 + 16;
const MYTRIP_TRIP_WIDE_QUICK_EXPENSE_ID_ = '__TRIP_WIDE__';

function setupMyTrip() {
  const properties = PropertiesService.getScriptProperties();
  let spreadsheetId = properties.getProperty(MYTRIP.spreadsheetProperty);
  let spreadsheet;
  if (spreadsheetId) {
    spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  } else {
    spreadsheet = SpreadsheetApp.create('MyTrip Dashboard Data');
    spreadsheetId = spreadsheet.getId();
    properties.setProperty(MYTRIP.spreadsheetProperty, spreadsheetId);
  }

  Object.keys(MYTRIP.sheets).forEach(function(name) {
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) sheet = spreadsheet.insertSheet(name);
    ensureHeaders(sheet, MYTRIP.sheets[name]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, sheet.getLastColumn()).setBackground('#17263c').setFontColor('#ffffff').setFontWeight('bold');
    sheet.autoResizeColumns(1, sheet.getLastColumn());
  });

  const defaultSheet = spreadsheet.getSheetByName('Sheet1');
  if (defaultSheet && spreadsheet.getSheets().length > 1) spreadsheet.deleteSheet(defaultSheet);
  migrateTravellerTripCreationLimits();
  migrateStickyNoteAccess();
  removeDuplicateStickyNotes();
  if (!properties.getProperty(MYTRIP.globalAdminUsernameProperty)) properties.setProperty(MYTRIP.globalAdminUsernameProperty, 'administrator');
  try { organiseMyTripDrive_(); } catch (driveError) { console.warn('Drive organisation skipped: ' + driveError.message); }
  console.log('MyTrip v' + MYTRIP.version + ' is ready. Spreadsheet: ' + spreadsheet.getUrl());
  return { spreadsheetId: spreadsheetId, spreadsheetUrl: spreadsheet.getUrl(), version: MYTRIP.version, accountLogin: true, identifierLogin: true, otpLogin: true, otpEmail: true, otpSms: false, emailOnlyOtp: true, contactVerification: true, passwordResetOtp: true, batchedSheetIO: true, singleDriveRoot: true, originalPhotos20MB: true, quickExpenseNoExpiry: true, quickExpenseValiditySchedule: true, accessAudit: true, travellerCredentialEdit: true, travellerTripCreation: true, travellerTripCreationQuota: true, tripPhotoGallery: true, settlementRecords: true, tripAnnouncements: true, ratingProGrace: true, quickExpenseLinks: true, quickExpenseAnyPayer: true, quickExpenseTripWide: true, quickExpenseHistoryControls: true, granularPermissions: true, systemHealth: true, sectionLoading: true, offlineExpenseQueue: true, receiptReadForScan: true, globalAdministratorConfigured: Boolean(getGlobalAdminHash()), globalAdministratorUsernameConfigured: Boolean(getGlobalAdminUsername()) };
}

/**
 * ONE-SHOT upgrade for spreadsheets created before 4.10.2, where every
 * assignment carried the old view-only sticky default.
 *
 * A deliberate "View only" set later through setTravellerStickyAccess writes
 * the SAME cell values as that old default, so the two cannot be told apart.
 * The pass is therefore guarded by a Script Property and runs exactly once:
 * after it, an Administrator's View-only decision survives every future
 * setupMyTrip(), runAll() and repairMyTripSpreadsheet().
 *
 * Pass true to run it again deliberately (opens sticky editing to every
 * traveller assigned to every trip).
 */
function migrateStickyNoteAccess(force) {
  const properties = PropertiesService.getScriptProperties();
  if (!force && properties.getProperty(MYTRIP.stickyAccessMigrationProperty)) return { updated: 0, alreadyRun: true };
  let opened = 0;
  objectsFromSheet('TripAssignments').forEach(function(assignment) {
    const level = String(assignment.stickyNoteAccess == null ? '' : assignment.stickyNoteAccess).trim().toLowerCase();
    if (level === 'edit') return;
    updateCellById('TripAssignments', assignment.id, 'stickyNoteAccess', 'edit');
    updateCellById('TripAssignments', assignment.id, 'canWriteStickyNotes', 'TRUE');
    opened++;
  });
  properties.setProperty(MYTRIP.stickyAccessMigrationProperty, new Date().toISOString());
  if (opened) console.log('Pinned sticky editing opened for ' + opened + ' existing traveller assignment(s). This runs once; View-only settings made from now on are kept.');
  return { updated: opened };
}

function migrateTravellerTripCreationLimits() {
  objectsFromSheet('TravellerAccounts').forEach(function(account) {
    if (String(account.tripCreationLimit == null ? '' : account.tripCreationLimit).trim() !== '') return;
    const legacyLimit = booleanSetting(account.canCreateTrips) ? 1 : 0;
    updateCellById('TravellerAccounts', account.travellerId, 'tripCreationLimit', legacyLimit, 'travellerId');
  });
}

/**
 * Simplest one-click recovery for a forgotten Administrator login.
 *
 * Run generateMyTripAdministratorLogin() once from the Apps Script editor.
 * It creates a unique username and strong temporary password automatically,
 * replaces the current Administrator login, and prints the new credentials in
 * the Execution log. Copy them immediately, sign in, and use Change login on
 * the Administrator dashboard to choose your own username and password.
 *
 * The generated password is stored permanently only as a SHA-256 hash. Anyone
 * who can run this function already has editor access to this Apps Script
 * project, so keep project-editor access restricted to trusted Administrators.
 */
function generateMyTripAdministratorLogin() {
  const username = generateAdministratorUsername();
  const passwordToken = Utilities.getUuid().replace(/-/g, '').substring(0, 12);
  const temporaryPassword = 'Mt!7-' + passwordToken;
  validateAdministratorSecret(temporaryPassword);

  const properties = PropertiesService.getScriptProperties();
  const replacements = {};
  replacements[MYTRIP.globalAdminUsernameProperty] = username;
  replacements[MYTRIP.globalAdminHashProperty] = hashGlobalAdministrator(temporaryPassword);
  properties.setProperties(replacements, false);
  properties.deleteProperty(MYTRIP.temporaryAdminUsernameResetProperty);
  properties.deleteProperty(MYTRIP.temporaryAdminResetProperty);

  console.log('MYTRIP ADMINISTRATOR LOGIN GENERATED SUCCESSFULLY');
  console.log('USERNAME: ' + username);
  console.log('TEMPORARY PASSWORD: ' + temporaryPassword);
  console.log('Sign in with these credentials, then select Change login on the Administrator dashboard.');
  return { generated: true, username: username, temporaryPassword: temporaryPassword, changeAfterLogin: true };
}

function generateAdministratorUsername() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = 'admin-' + Utilities.getUuid().replace(/-/g, '').substring(0, 8).toLowerCase();
    try { return ensureAdministratorUsernameAvailable(candidate); }
    catch (error) {
      if (!/Traveller account/.test(String(error && error.message || error))) throw error;
    }
  }
  throw new Error('A unique Administrator username could not be generated. Run the function again.');
}

/**
 * One-time recovery utility for a forgotten global Administrator password.
 *
 * Before running this function, open Apps Script > Project Settings > Script
 * Properties and add:
 *   Property: MYTRIP_NEW_ADMIN_SECRET
 *   Value:    your new 6-to-64-character Administrator password
 *
 * Run resetMyTripAdministratorPin() once from the Apps Script editor. The new
 * secret is stored only as a SHA-256 hash and the temporary plain-text property
 * is deleted immediately. You do not need to redeploy the web app after the
 * reset because Script Properties are shared by the deployed version.
 */
function resetMyTripAdministratorPin() {
  const properties = PropertiesService.getScriptProperties();
  const temporarySecret = String(properties.getProperty(MYTRIP.temporaryAdminResetProperty) || '');
  if (!temporarySecret) {
    throw new Error('Add the Script Property MYTRIP_NEW_ADMIN_SECRET with your new Administrator password, then run this function again.');
  }

  validateAdministratorSecret(temporarySecret);
  properties.setProperty(MYTRIP.globalAdminHashProperty, hashGlobalAdministrator(temporarySecret));
  properties.deleteProperty(MYTRIP.temporaryAdminResetProperty);
  console.log('MyTrip global Administrator password was reset. The temporary plain-text property was deleted.');
  return { reset: true, temporarySecretDeleted: true };
}

/**
 * One-time recovery utility for a forgotten global Administrator username.
 *
 * Before running this function, open Apps Script > Project Settings > Script
 * Properties and add:
 *   Property: MYTRIP_NEW_ADMIN_USERNAME
 *   Value:    your new 3-to-40-character Administrator username
 *
 * Run resetMyTripAdministratorUsername() once from the Apps Script editor.
 * The current Administrator password remains unchanged. The username must not
 * match a Traveller username, and the temporary property is deleted
 * immediately after a successful reset.
 */
function resetMyTripAdministratorUsername() {
  const properties = PropertiesService.getScriptProperties();
  const temporaryUsername = String(properties.getProperty(MYTRIP.temporaryAdminUsernameResetProperty) || '');
  if (!temporaryUsername) {
    throw new Error('Add the Script Property MYTRIP_NEW_ADMIN_USERNAME with your new Administrator username, then run this function again.');
  }

  const newUsername = ensureAdministratorUsernameAvailable(temporaryUsername);
  properties.setProperty(MYTRIP.globalAdminUsernameProperty, newUsername);
  properties.deleteProperty(MYTRIP.temporaryAdminUsernameResetProperty);
  console.log('MyTrip global Administrator username was reset. The existing password is unchanged and the temporary property was deleted.');
  return { reset: true, username: newUsername, passwordChanged: false, temporaryUsernameDeleted: true };
}

/**
 * One-time recovery utility to replace both global Administrator credentials.
 *
 * In Apps Script > Project Settings > Script Properties, add both:
 *   MYTRIP_NEW_ADMIN_USERNAME = your new Administrator username
 *   MYTRIP_NEW_ADMIN_SECRET   = your new Administrator password
 *
 * Run resetMyTripAdministratorLogin() once. Both values are validated before
 * either live credential is changed. The password is stored only as a SHA-256
 * hash, and both temporary properties are deleted immediately after success.
 */
function resetMyTripAdministratorLogin() {
  const properties = PropertiesService.getScriptProperties();
  const temporaryUsername = String(properties.getProperty(MYTRIP.temporaryAdminUsernameResetProperty) || '');
  const temporarySecret = String(properties.getProperty(MYTRIP.temporaryAdminResetProperty) || '');
  if (!temporaryUsername && !temporarySecret) {
    console.log('No manual recovery values were supplied. Generating a new Administrator login automatically.');
    return generateMyTripAdministratorLogin();
  }
  if (!temporaryUsername || !temporarySecret) {
    throw new Error('Add both Script Properties MYTRIP_NEW_ADMIN_USERNAME and MYTRIP_NEW_ADMIN_SECRET, then run this function again.');
  }

  const newUsername = ensureAdministratorUsernameAvailable(temporaryUsername);
  validateAdministratorSecret(temporarySecret);
  const replacements = {};
  replacements[MYTRIP.globalAdminUsernameProperty] = newUsername;
  replacements[MYTRIP.globalAdminHashProperty] = hashGlobalAdministrator(temporarySecret);
  properties.setProperties(replacements, false);
  properties.deleteProperty(MYTRIP.temporaryAdminUsernameResetProperty);
  properties.deleteProperty(MYTRIP.temporaryAdminResetProperty);
  console.log('MyTrip global Administrator username and password were reset. Both temporary properties were deleted.');
  return { reset: true, username: newUsername, passwordChanged: true, temporaryValuesDeleted: true };
}

function doGet() {
  return jsonResponse({ ok: true, data: { app: 'MyTrip', version: MYTRIP.version, status: 'ready', stickyNoteDiary: true, sharedStickyNotes: true, feedback: true, itineraryPlanner: true, sharedTripList: true, idleSignout: true, profilePhotos: true, accountLogin: true, identifierLogin: true, otpLogin: true, otpEmail: true, otpSms: false, emailOnlyOtp: true, contactVerification: true, passwordResetOtp: true, batchedSheetIO: true, singleDriveRoot: true, originalPhotos20MB: true, quickExpenseNoExpiry: true, quickExpenseValiditySchedule: true, accessAudit: true, travellerCredentialEdit: true, administratorLoginEdit: true, travellerTripCreation: true, travellerTripCreationQuota: true, tripPhotoGallery: true, tripAnnouncements: true, ratingProGrace: true, quickExpenseLinks: true, quickExpenseAnyPayer: true, quickExpenseTripWide: true, quickExpenseHistoryControls: true, granularPermissions: true, systemHealth: true, sectionLoading: true, offlineExpenseQueue: true, receiptReadForScan: true } });
}

function doPost(e) {
  try {
    const body = parseBody(e);
    const action = cleanText(body.action, 40);
    if (!action) throw new Error('No action was supplied.');
    if (action === 'ping') return jsonResponse({ ok: true, data: { status: 'ready', version: MYTRIP.version, stickyNoteDiary: true, sharedStickyNotes: true, itineraryPlanner: true, sharedTripList: true, idleSignout: true, profilePhotos: true, accountLogin: true, identifierLogin: true, otpLogin: true, otpEmail: true, otpSms: false, emailOnlyOtp: true, contactVerification: true, passwordResetOtp: true, batchedSheetIO: true, singleDriveRoot: true, originalPhotos20MB: true, quickExpenseNoExpiry: true, quickExpenseValiditySchedule: true, accessAudit: true, travellerCredentialEdit: true, administratorLoginEdit: true, travellerTripCreation: true, travellerTripCreationQuota: true, tripPhotoGallery: true, settlementRecords: true, tripAnnouncements: true, ratingProGrace: true, quickExpenseLinks: true, quickExpenseAnyPayer: true, quickExpenseTripWide: true, quickExpenseHistoryControls: true, granularPermissions: true, systemHealth: true, sectionLoading: true, offlineExpenseQueue: true, receiptReadForScan: true, globalAdministratorConfigured: Boolean(getGlobalAdminHash()), globalAdministratorUsernameConfigured: Boolean(getGlobalAdminUsername()) } });
    if (action === 'getQuickExpenseInfo') return jsonResponse({ ok: true, data: getQuickExpenseInfo(body.quickToken || body.token) });
    if (action === 'quickAddExpense') return jsonResponse({ ok: true, data: withLock(function() { return quickAddExpense(body.quickToken || body.token, body.record, body.client); }) });
    if (action === 'quickUpdateExpense') return jsonResponse({ ok: true, data: withLock(function() { return quickUpdateExpense(body.quickToken || body.token, body.id, body.record); }) });
    if (action === 'quickDeleteExpense') return jsonResponse({ ok: true, data: withLock(function() { return quickDeleteExpense(body.quickToken || body.token, body.id); }) });
    if (action === 'quickUploadExpenseReceipt') return jsonResponse({ ok: true, data: withLock(function() { return quickUploadExpenseReceipt(body.quickToken || body.token, body.id, body.file); }) });
    if (action === 'quickGetExpenseReceipt') return jsonResponse({ ok: true, data: quickGetExpenseReceipt_(body.quickToken || body.token, body.id) });
    if (action === 'login') return jsonResponse({ ok: true, data: authenticateAccountWithAudit_(body.identifier || body.username, String(body.password || body.pin || ''), body.client) });
    if (action === 'requestLoginOtp') return jsonResponse({ ok: true, data: withLock(function() { return requestLoginOtp(body.identifier || body.username, body.channel); }) });
    if (action === 'loginWithOtp') return jsonResponse({ ok: true, data: withLock(function() { return authenticateAccountOtpWithAudit_(body.identifier || body.username, body.challengeId, body.otp, body.client); }) });
    if (action === 'requestPasswordResetOtp') return jsonResponse({ ok: true, data: withLock(function() { return requestPasswordResetOtp(body.identifier || body.username, body.channel); }) });
    if (action === 'resetPasswordWithOtp') return jsonResponse({ ok: true, data: withLock(function() { return resetPasswordWithOtp(body.identifier || body.username, body.challengeId, body.otp, body.newPassword); }) });
    if (action === 'listAccessAudit') {
      verifyGlobalAdministrator(body.username || body.adminUsername, String(body.password || body.pin || body.adminPin || ''));
      return jsonResponse({ ok: true, data: listAccessAudit(body.filters || body) });
    }
    if (action === 'getSystemHealth') {
      verifyGlobalAdministrator(body.username || body.adminUsername, String(body.password || body.pin || body.adminPin || ''));
      return jsonResponse({ ok: true, data: myTripSystemHealth_() });
    }
    if (action === 'repairSystemHealth') {
      verifyGlobalAdministrator(body.username || body.adminUsername, String(body.password || body.pin || body.adminPin || ''));
      return jsonResponse({ ok: true, data: withLock(function() { repairMyTripSpreadsheet(); return myTripSystemHealth_(); }) });
    }
    if (action === 'runSystemBackup') {
      verifyGlobalAdministrator(body.username || body.adminUsername, String(body.password || body.pin || body.adminPin || ''));
      return jsonResponse({ ok: true, data: backupMyTrip() });
    }
    if (action === 'setSystemNightlyBackup') {
      verifyGlobalAdministrator(body.username || body.adminUsername, String(body.password || body.pin || body.adminPin || ''));
      if (body.enabled === true) installNightlyBackup();
      else if (body.enabled === false) ScriptApp.getProjectTriggers().filter(function(trigger) { return trigger.getHandlerFunction() === 'backupMyTrip'; }).forEach(function(trigger) { ScriptApp.deleteTrigger(trigger); });
      else throw new Error('Choose whether nightly backup is enabled.');
      return jsonResponse({ ok: true, data: { enabled: body.enabled } });
    }
    if (action === 'recordAccessEvent') return jsonResponse({ ok: true, data: recordAuthenticatedAccessEvent_(body) });
    if (action === 'listTrips') {
      const administratorUsername = verifyGlobalAdministrator(body.username || body.adminUsername, String(body.password || body.pin || body.adminPin || ''));
      return jsonResponse({ ok: true, data: { accessRole: MYTRIP.roles.administrator, account: administratorSafeAccount_(), trips: listTripSummaries() } });
    }
    if (action === 'listMyTrips') {
      let traveller = verifyTravellerAccount(body.username || body.travellerId, String(body.password || body.pin || ''));
      traveller = enforceRatingPlanForTraveller_(traveller.travellerId);
      return jsonResponse({ ok: true, data: { accessRole: MYTRIP.roles.traveller, account: { username: traveller.travellerId, role: MYTRIP.roles.traveller }, traveller: safeTravellerAccount(traveller), trips: listTravellerTripSummaries(traveller.travellerId) } });
    }
    if (action === 'uploadProfilePhoto') {
      /* The Administrator may set anyone's photo; a traveller only their own. */
      let isAdministrator = false;
      try { verifyGlobalAdministrator(body.username || body.adminUsername, String(body.password || body.pin || body.adminPin || '')); isAdministrator = true; } catch (error) {}
      const target = cleanText(body.target, 20) === 'admin' ? 'admin' : 'traveller';
      if (target === 'admin') {
        if (!isAdministrator) throw new Error('Only the Administrator can change the Administrator photo.');
        return jsonResponse({ ok: true, data: saveProfilePhoto('admin', '', body.file, body.remove === true) });
      }
      let travellerId = normaliseTravellerId(body.travellerId || body.username);
      if (!isAdministrator) travellerId = verifyTravellerAccount(body.username || body.travellerId, String(body.password || body.pin || '')).travellerId;
      return jsonResponse({ ok: true, data: saveProfilePhoto('traveller', travellerId, body.file, body.remove === true) });
    }
    if (action === 'getProfilePhotos') return jsonResponse({ ok: true, data: profilePhotoMap() });
    if (action === 'getTripThumbs') return jsonResponse({ ok: true, data: tripThumbMap_() });
    if (action === 'setIdleTimeout') {
      verifyGlobalAdministrator(body.username || body.adminUsername, String(body.password || body.pin || body.adminPin || ''));
      return jsonResponse({ ok: true, data: setIdleMinutes(body.minutes) });
    }
    if (action === 'listTravellerAccounts') {
      verifyGlobalAdministrator(body.username || body.adminUsername, String(body.password || body.pin || body.adminPin || ''));
      return jsonResponse({ ok: true, data: { accessRole: MYTRIP.roles.administrator, travellers: listTravellerAccounts() } });
    }
    if (action === 'createTravellerAccount') {
      verifyGlobalAdministrator(body.username || body.adminUsername, String(body.password || body.pin || body.adminPin || ''));
      return jsonResponse({ ok: true, data: withLock(function() { return createTravellerAccount(body.traveller || body.record); }) });
    }
    if (action === 'updateTravellerAccount') {
      verifyGlobalAdministrator(body.username || body.adminUsername, String(body.password || body.pin || body.adminPin || ''));
      return jsonResponse({ ok: true, data: withLock(function() { return updateTravellerAccount(body.travellerId, body.traveller || body.record); }) });
    }
    if (action === 'getInviteInfo') {
      const t = tripForInvite_(body.code);
      return jsonResponse({ ok: true, data: { tripName: t.name || '', destination: t.destination || '', startDate: t.startDate || '', endDate: t.endDate || '' } });
    }
    if (action === 'joinTripByInvite') {
      return jsonResponse({ ok: true, data: withLock(function() { return joinTripByInvite(body); }) });
    }
    if (action === 'changeMyPassword') {
      const me = verifyTravellerAccount(body.username || body.travellerId, String(body.currentPassword || ''));
      if (me.pinHash === hashTravellerAccountPin(me.travellerId, String(body.newPassword || ''))) throw new Error('The new password must be different from the current one.');
      return jsonResponse({ ok: true, data: withLock(function() { return resetTravellerPin(me.travellerId, body.newPassword); }) });
    }
    if (action === 'listTripOwnerTravellers') {
      const owner = verifyTravellerAccount(body.username || body.travellerId, String(body.password || body.pin || ''));
      return jsonResponse({ ok: true, data: tripOwnerTravellers(owner.travellerId) });
    }
    if (action === 'tripOwnerResetPin') {
      const owner = verifyTravellerAccount(body.username || body.travellerId, String(body.password || body.pin || ''));
      const allowed = tripOwnerTravellers(owner.travellerId).travellers.some(function(t) { return t.travellerId === normaliseTravellerId(body.targetTravellerId); });
      if (!allowed) throw new Error('You can only reset passwords of travellers in trips you created.');
      return jsonResponse({ ok: true, data: withLock(function() { return resetTravellerPin(body.targetTravellerId, body.newPassword); }) });
    }
    if (action === 'resetTravellerPin') {
      verifyGlobalAdministrator(body.username || body.adminUsername, String(body.password || body.pin || body.adminPin || ''));
      return jsonResponse({ ok: true, data: withLock(function() { return resetTravellerPin(body.travellerId, body.newPin || body.travellerPin); }) });
    }
    if (action === 'updateTravellerCredentials') {
      verifyGlobalAdministrator(body.username || body.adminUsername, String(body.password || body.pin || body.adminPin || ''));
      return jsonResponse({ ok: true, data: withLock(function() { return updateTravellerCredentials(body.travellerId, body.newTravellerId || body.newUsername, body.newPin || body.newPassword, body.confirmTravellerId); }) });
    }
    if (action === 'deleteTravellerAccount') {
      verifyGlobalAdministrator(body.username || body.adminUsername, String(body.password || body.pin || body.adminPin || ''));
      return jsonResponse({ ok: true, data: withLock(function() { return deleteTravellerAccount(body.travellerId, body.confirmTravellerId); }) });
    }
    if (action === 'setTravellerActive') {
      verifyGlobalAdministrator(body.username || body.adminUsername, String(body.password || body.pin || body.adminPin || ''));
      return jsonResponse({ ok: true, data: withLock(function() { return setTravellerActive(body.travellerId, body.active); }) });
    }
    if (action === 'setTravellerTripCreationAccess') {
      verifyGlobalAdministrator(body.username || body.adminUsername, String(body.password || body.pin || body.adminPin || ''));
      return jsonResponse({ ok: true, data: withLock(function() { return setTravellerTripCreationAccess(body.travellerId, body.allowed); }) });
    }
    if (action === 'setTravellerPlan') {
      verifyGlobalAdministrator(body.username || body.adminUsername, String(body.password || body.pin || body.adminPin || ''));
      return jsonResponse({ ok: true, data: withLock(function() { return setTravellerPlan(body.travellerId, body.plan, body.planExpires, body.planSource); }) });
    }
    if (action === 'setProEnforced') {
      verifyGlobalAdministrator(body.username || body.adminUsername, String(body.password || body.pin || body.adminPin || ''));
      PropertiesService.getScriptProperties().setProperty('MYTRIP_PRO_ENFORCED', body.enabled === true || String(body.enabled) === 'true' ? 'TRUE' : 'FALSE');
      return jsonResponse({ ok: true, data: { proEnforced: isProEnforced() } });
    }
    if (action === 'getPlanSettings') {
      verifyGlobalAdministrator(body.username || body.adminUsername, String(body.password || body.pin || body.adminPin || ''));
      return jsonResponse({ ok: true, data: { proEnforced: isProEnforced() } });
    }
    if (action === 'setTravellerTripCreationLimit') {
      verifyGlobalAdministrator(body.username || body.adminUsername, String(body.password || body.pin || body.adminPin || ''));
      return jsonResponse({ ok: true, data: withLock(function() { return setTravellerTripCreationLimit(body.travellerId, body.limit); }) });
    }
    if (action === 'assignTravellerToTrips') {
      verifyGlobalAdministrator(body.username || body.adminUsername, String(body.password || body.pin || body.adminPin || ''));
      return jsonResponse({ ok: true, data: withLock(function() { return assignTravellerToTrips(body.travellerId, body.tripIds, body.role); }) });
    }
    if (action === 'changeAdministratorLogin') {
      verifyGlobalAdministrator(body.username || body.adminUsername, String(body.password || body.pin || body.adminPin || ''));
      return jsonResponse({ ok: true, data: withLock(function() { return changeAdministratorLogin(body.newUsername, body.newPassword, body.email, body.phone, body.otpEnabled); }) });
    }
    if (action === 'createTravellerTrip') {
      const traveller = verifyTravellerAccount(body.username || body.travellerId, String(body.password || body.pin || ''));
      return jsonResponse({ ok: true, data: withLock(function() { return createTravellerTrip(traveller, body); }) });
    }
    if (action === 'createTrip') return jsonResponse({ ok: true, data: createTrip(body) });

    const tripId = normaliseTripId(body.tripId);
    const pin = String(body.password || body.pin || '');
    const username = cleanText(body.username || body.adminUsername, 40);
    const requestedTravellerId = cleanText(body.travellerId, 30) ? normaliseTravellerId(body.travellerId) : '';
    const accessRole = verifyAccess(tripId, pin, requestedTravellerId, username);
    const featurePermissions = permissionsFor(accessRole, tripId, requestedTravellerId);
    if (action === 'getTrip') {
      const bundle = getTripBundle(tripId, accessRole, requestedTravellerId);
      logTripOpen_(tripId, accessRole, requestedTravellerId, username, body.client);
      return jsonResponse({ ok: true, data: bundle });
    }
    if (action === 'getTripSection') {
      return jsonResponse({ ok: true, data: getTripSectionBundle_(tripId, accessRole, requestedTravellerId, body.section) });
    }
    if (action === 'getExpenseReceipt') {
      if (!featurePermissions.viewExpenses) throw new Error('Expense viewing is not allowed for this account.');
      return jsonResponse({ ok: true, data: getExpenseReceiptForScan_(tripId, body.id) });
    }
    if (action === 'saveFeedback') return jsonResponse({ ok: true, data: withLock(function() { return saveFeedback(tripId, accessRole, requestedTravellerId, username, body.feedback); }) });
    if (action === 'getFeedback') {
      if (accessRole !== MYTRIP.roles.administrator) throw new Error('Only the Administrator can see feedback.');
      return jsonResponse({ ok: true, data: feedbackSummary() });
    }

    const administratorOnly = {
      addMember: true,
      updateTrip: true,
      deleteTrip: true,
      deleteRecord: true,
      changePins: true,
      setTripEnabled: true,
      setTripListHidden: true,
      setTripListOrder: true,
      uploadTripPhoto: true,
      removeTripPhoto: true,
      assignTraveller: true,
      assignTravellers: true,
      removeTravellerAssignment: true,
      setTravellerExpenseAccess: true,
      setTravellerFeatureAccess: true,
      setTripPhotoUploadEnabled: true,
      setTravellerPhotoLimit: true,
      setTravellerStickyAccess: true,
      listActivity: true, listBackups: true, backupNow: true, removeDuplicateRows: true,
      resplitExpenses: true, createTripInvite: true, disableTripInvite: true, listJoinRequests: true, approveJoinRequest: true, rejectJoinRequest: true,
      addSettlement: true,
      listQuickExpensePasses: true, createQuickExpensePass: true, setQuickExpensePassEnabled: true, updateQuickExpensePassSettings: true
    };
    if (administratorOnly[action] && accessRole !== MYTRIP.roles.administrator) {
      throw new Error('Global Administrator access required for this action.');
    }
    const actionPermission = { addPlan: 'addPlan', addExperience: 'addExperience', addPlace: 'managePlaces', addExpense: 'addExpense', uploadExpenseReceipt: 'addExpense', removeExpenseReceipt: 'addExpense', archiveStickyNote: 'writeStickyNotes', uploadTripMemoryPhoto: 'addPhotos' }[action];
    if (actionPermission && featurePermissions[actionPermission] === false) throw new Error('Access to this feature is hidden for this Traveller ID by the Administrator.');
    const sheetPermission = { Itinerary: 'viewItinerary', ExperienceNotes: 'viewExperiences', Places: 'viewPlaces', Expenses: 'viewExpenses' }[body.sheet];
    if (action === 'updateRecord' && sheetPermission && featurePermissions[sheetPermission] === false) throw new Error('Access to this feature is hidden for this Traveller ID by the Administrator.');
    if (action === 'updateRecord' && accessRole !== MYTRIP.roles.administrator) assertTravellerMayEditRecord_(tripId, body.sheet, body.id, requestedTravellerId, featurePermissions);
    if (['uploadExpenseReceipt', 'removeExpenseReceipt'].indexOf(action) >= 0 && accessRole !== MYTRIP.roles.administrator) {
      const receiptExpense = recordsForTrip('Expenses', tripId).filter(function(row) { return String(row.id) === String(body.id); })[0];
      const freshOwnUpload = action === 'uploadExpenseReceipt' && featurePermissions.addExpense && receiptExpense && String(receiptExpense.createdByAccount).toLowerCase() === ('traveller:' + requestedTravellerId).toLowerCase() && Date.now() - new Date(receiptExpense.createdAt).getTime() <= 10 * 60 * 1000;
      if (!freshOwnUpload) assertTravellerMayEditRecord_(tripId, 'Expenses', body.id, requestedTravellerId, featurePermissions);
    }
    if (['addPlan', 'addExpense', 'addPlace', 'addExperience'].indexOf(action) >= 0) {
      body.record = Object.assign({}, body.record || {}, { createdByAccount: accessRole === MYTRIP.roles.administrator ? 'administrator:' + String(username).toLowerCase() : requestedTravellerId ? 'traveller:' + requestedTravellerId : 'shared:' + tripId });
    }

    const stickyLevel = stickyNoteAccessLevel(accessRole, tripId, requestedTravellerId);
    const stickyAuthor = cleanText(body.author || body.createdBy, 80) || requestedTravellerId || (accessRole === MYTRIP.roles.administrator ? 'Administrator' : 'Trip member');

    const mutations = {
      saveStickyNote: function() { return saveStickyNote(tripId, body.record || body.note, stickyAuthor, stickyLevel, body.geometryOnly === true); },
      deleteStickyNote: function() { return deleteStickyNote(tripId, body.id, stickyLevel); },
      setTravellerStickyAccess: function() { return setTravellerStickyAccess(tripId, body.travellerId, body.level); },
      addPlan: function() { return addPlan(tripId, body.record); },
      addExpense: function() { return addExpense(tripId, body.record); },
      addSettlement: function() { return addSettlement(tripId, body.record); },
      addPlace: function() { return addPlace(tripId, body.record); },
      addExperience: function() { return addExperience(tripId, body.record); },
      archiveStickyNote: function() { return archiveStickyNote(tripId, body.record); },
      addMember: function() { return addMember(tripId, body.record); },
      updateTrip: function() { return updateTrip(tripId, body.trip); },
      deleteTrip: function() { return deleteTrip(tripId, body.confirmTripId); },
      updateRecord: function() { return updateRecord(tripId, body.sheet, body.id, body.record, accessRole); },
      deleteRecord: function() { return deleteRecord(tripId, body.sheet, body.id); },
      changePins: function() { return changePins(tripId, body.adminUsername || body.username, body.adminPin, body.travellerPin); },
      setTripEnabled: function() { return setTripEnabled(tripId, body.enabled); },
      setTripListHidden: function() { return setTripListHidden(tripId, body.hidden); },
      setTripListOrder: function() { return setTripListOrder(body.order); },
      uploadTripPhoto: function() { return uploadTripPhoto(tripId, body.file); },
      removeTripPhoto: function() { return removeTripPhoto(tripId); },
      assignTraveller: function() { return assignTravellerToTrip(tripId, body.traveller || body.record); },
      assignTravellers: function() { return assignMultipleTravellersToTrip(tripId, body.travellers || body.travellerIds); },
      removeTravellerAssignment: function() { return removeTravellerAssignment(tripId, body.travellerId); },
      setTravellerExpenseAccess: function() { return setTravellerExpenseAccess(tripId, body.travellerId, body.allowed); },
      setTravellerFeatureAccess: function() { return setTravellerFeatureAccess(tripId, body.travellerId, body.permissions); },
      setTripPhotoUploadEnabled: function() { return setTripPhotoUploadEnabled(tripId, body.enabled); },
      setTravellerPhotoLimit: function() { return setTravellerPhotoLimit(tripId, body.travellerId, body.limit, body.quality); },
      uploadTripMemoryPhoto: function() { return uploadTripMemoryPhoto(tripId, body.file, body.caption, accessRole, requestedTravellerId); },
      replaceTripMemoryPhoto: function() { return replaceTripMemoryPhoto(tripId, body.photoId, body.file, body.caption, accessRole, requestedTravellerId); },
      uploadExpenseReceipt: function() { return uploadExpenseReceipt(tripId, body.id, body.file); },
      removeExpenseReceipt: function() { return removeExpenseReceipt(tripId, body.id); },
      addChecklistItem: function() { return addChecklistItem(tripId, body.record); },
      updateChecklistItem: function() { return updateChecklistItem(tripId, body.id, body.record); },
      deleteChecklistItem: function() { return deleteChecklistItem(tripId, body.id); },
      resplitExpenses: function() { return resplitExpenses(tripId, body.ids, body.sharedBy); },
      createTripInvite: function() { return createTripInvite(tripId, body.role, body.expires); },
      disableTripInvite: function() { return disableTripInvite(tripId); },
      listJoinRequests: function() { return listJoinRequests(tripId); },
      approveJoinRequest: function() { return decideJoinRequest(tripId, body.id, true); },
      rejectJoinRequest: function() { return decideJoinRequest(tripId, body.id, false); },
      deleteTripMemoryPhoto: function() { return deleteTripMemoryPhoto(tripId, body.photoId, accessRole, requestedTravellerId); },
      listActivity: function() { return listActivity(tripId, body.limit); },
      listBackups: function() { return listBackups_(); },
      backupNow: function() { return backupMyTrip(); },
      removeDuplicateRows: function() { return removeDuplicateRows(); },
      listQuickExpensePasses: function() { return listQuickExpensePasses(tripId); },
      createQuickExpensePass: function() { return createQuickExpensePass(tripId, body.travellerId, body.quickToken || body.token, body.settings || body, body.client); },
      setQuickExpensePassEnabled: function() { return setQuickExpensePassEnabled(tripId, body.id, body.enabled, body.client); },
      updateQuickExpensePassSettings: function() { return updateQuickExpensePassSettings(tripId, body.id, body.settings || body, body.client); }
    };
    if (!mutations[action]) throw new Error('Unknown action: ' + action);
    const result = withLock(mutations[action]);
    try { autoLogActivity_(tripId, action, body, stickyAuthor); } catch (logError) { console.warn('Activity log skipped: ' + logError); }
    return jsonResponse({ ok: true, data: result });
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return jsonResponse({ ok: false, error: error.message || String(error) });
  }
}

function createTrip(body) {
  return withLock(function() {
    const trip = body.trip || {};
    const adminUsername = body.adminUsername || body.username || trip.adminUsername || 'administrator';
    const adminPin = String(body.adminPin || trip.adminPin || '');
    const travellerPin = String(body.travellerPin || trip.travellerPin || '');
    validateAccessSecrets(adminPin, travellerPin);
    ensureGlobalAdministrator(adminUsername, adminPin);

    const name = requiredText(trip.name, 'Trip name', 100);
    const destination = requiredText(trip.destination, 'Destination', 120);
    const startDate = validDate(trip.startDate, 'Start date');
    const endDate = validDate(trip.endDate, 'End date');
    if (new Date(endDate) < new Date(startDate)) throw new Error('End date cannot be before the start date.');
    const createdBy = requiredText(trip.createdBy || 'Organiser', 'Organiser name', 80);
    const tripId = uniqueTripId(destination);
    const now = new Date().toISOString();

    appendObject('Trips', {
      tripId: tripId,
      name: name,
      destination: destination,
      startDate: startDate,
      endDate: endDate,
      budget: positiveNumber(trip.budget, 'Budget', true),
      currency: cleanText(trip.currency || 'INR', 5),
      photoUrl: normalisePhotoUrl(trip.photoUrl),
      photoFileId: '',
      photoUploadsEnabled: 'TRUE',
      enabled: 'TRUE',
      accessHash: '',
      adminHash: '',
      travellerHash: hashPin(tripId, travellerPin, MYTRIP.roles.traveller),
      createdBy: createdBy,
      createdByTravellerId: '',
      announcementEnabled: 'FALSE',
      announcementText: '',
      announcementStyle: 'warning',
      announcementStart: '',
      announcementEnd: '',
      announcementSpeed: 'normal',
      ratingRequired: 'FALSE',
      ratingGraceDays: 7,
      createdAt: now,
      updatedAt: now
    });
    appendObject('Members', { id: createId('MEM'), tripId: tripId, name: createdBy, role: 'Organiser', createdAt: now });
    logActivity(tripId, 'TRIP_CREATED', name, createdBy);
    return getTripBundle(tripId, MYTRIP.roles.administrator);
  });
}

function createTravellerTrip(traveller, body) {
  traveller = getTravellerAccount(traveller.travellerId, false);
  const quota = travellerTripCreationStatus(traveller);
  if (!quota.enabled) throw new Error('The Global Administrator has disabled trip creation for this account.');
  if (!quota.canCreateAnotherTrip) throw new Error('Your trip-creation limit has been reached (' + quota.createdTripCount + ' of ' + quota.tripCreationLimit + '). Ask the Global Administrator to increase it.');
  const trip = body.trip || {};
  const sharedPassword = validateSharedTripPassword(body.sharedPassword || body.travellerPin || trip.sharedPassword || trip.travellerPin);
  if (traveller.pinHash === hashTravellerAccountPin(traveller.travellerId, sharedPassword)) throw new Error('Choose a shared trip password different from your personal password.');

  const name = requiredText(trip.name, 'Trip name', 100);
  const destination = requiredText(trip.destination, 'Destination', 120);
  const startDate = validDate(trip.startDate, 'Start date');
  const endDate = validDate(trip.endDate, 'End date');
  if (new Date(endDate) < new Date(startDate)) throw new Error('End date cannot be before the start date.');
  const tripId = uniqueTripId(destination);
  const now = new Date().toISOString();

  appendObject('Trips', {
    tripId: tripId,
    name: name,
    destination: destination,
    startDate: startDate,
    endDate: endDate,
    budget: positiveNumber(trip.budget, 'Budget', true),
    currency: cleanText(trip.currency || 'INR', 5),
    photoUrl: normalisePhotoUrl(trip.photoUrl),
    photoFileId: '',
    photoUploadsEnabled: 'TRUE',
    enabled: 'TRUE',
    accessHash: '',
    adminHash: '',
    travellerHash: hashPin(tripId, sharedPassword, MYTRIP.roles.traveller),
    createdBy: traveller.name,
    createdByTravellerId: traveller.travellerId,
    announcementEnabled: 'FALSE',
    announcementText: '',
    announcementStyle: 'warning',
    announcementStart: '',
    announcementEnd: '',
    announcementSpeed: 'normal',
    ratingRequired: 'FALSE',
    ratingGraceDays: 7,
    createdAt: now,
    updatedAt: now
  });
  appendObject('Members', { id: createId('MEM'), tripId: tripId, travellerId: traveller.travellerId, name: traveller.name, role: 'Organiser', createdAt: now });
  appendObject('TripAssignments', {
    id: createId('ASN'),
    tripId: tripId,
    travellerId: traveller.travellerId,
    role: 'Organiser',
    canViewItinerary: 'TRUE',
    canViewExperiences: 'TRUE',
    canViewPlaces: 'TRUE',
    canViewExpenses: 'TRUE',
    canViewTravellers: 'TRUE',
    canPrint: 'TRUE',
    canWriteStickyNotes: 'TRUE',
    stickyNoteAccess: 'edit',
    itineraryAccess: 'full',
    experienceAccess: 'full',
    placesAccess: 'full',
    expenseAccess: 'full',
    travellersAccess: 'full',
    printAccess: 'full',
    photoLimit: 0,
    createdAt: now
  });
  logActivity(tripId, 'TRIP_CREATED_BY_TRAVELLER', name + ' · ' + traveller.travellerId, traveller.name);
  return getTripBundle(tripId, MYTRIP.roles.traveller, traveller.travellerId);
}

/* An experience note marked 'Only me' is hidden from everyone except its
   writer and the Administrator. Matched by the writer's name on the Members
   sheet for the requesting traveller, since experiences are stored by name. */
function visibleExperiences(list, accessRole, tripId, travellerId) {
  if (accessRole === MYTRIP.roles.administrator) return list;
  let me = '';
  if (travellerId) {
    const match = recordsForTrip('Members', tripId).filter(function(m) { return String(m.travellerId || '').trim().toUpperCase() === String(travellerId || '').trim().toUpperCase(); })[0];
    me = match ? String(match.name || '').trim().toLowerCase() : '';
  }
  return list.filter(function(item) {
    const vis = String(item.visibility || '').trim().toLowerCase();
    if (vis !== 'only me') return true;
    return Boolean(me) && String(item.writer || '').trim().toLowerCase() === me;
  });
}

/* Settlement records follow the same rule as the Settle up screen: travellers
   only receive them once the Administrator has switched Settle up on, or the
   trip end date has passed. Mirrors settleShown() in the frontend. */
function settleShownForTravellers_(trip) {
  if (String(trip.settleVisible || '').toUpperCase() === 'TRUE') return true;
  const end = String(trip.endDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return false;
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return today > end;
}

function getTripBundle(tripId, accessRole, travellerId) {
  const trip = getTripRow(tripId);
  const ratingAccount = accessRole !== MYTRIP.roles.administrator && travellerId ? enforceRatingPlanForTraveller_(travellerId) : null;
  const effectivePlan = accessRole === MYTRIP.roles.administrator ? 'pro' : (ratingAccount ? travellerPlanOf(ratingAccount) : 'free');
  const safeTrip = Object.assign({}, trip);
  const permissions = permissionsFor(accessRole, tripId, travellerId);
  delete safeTrip.accessHash;
  delete safeTrip.adminHash;
  delete safeTrip.travellerHash;
  delete safeTrip.photoFileId;
  delete safeTrip.createdByTravellerId;
  if (!permissions.viewExpenses) delete safeTrip.budget;
  const assignments = recordsForTrip('TripAssignments', tripId).map(function(item) {
    const safeAssignment = Object.assign({}, item);
    if (accessRole !== MYTRIP.roles.administrator) {
      ['canViewItinerary', 'canViewExperiences', 'canViewPlaces', 'canViewExpenses', 'canViewTravellers', 'canPrint', 'canWriteStickyNotes', 'stickyNoteAccess', 'itineraryAccess', 'experienceAccess', 'placesAccess', 'expenseAccess', 'travellersAccess', 'printAccess', 'photoLimit'].forEach(function(field) { delete safeAssignment[field]; });
    }
    return safeAssignment;
  });
  return {
    trip: safeTrip,
    accessRole: accessRole,
    permissions: permissions,
    plan: effectivePlan,
    planSource: accessRole === MYTRIP.roles.administrator ? 'protected' : (ratingAccount ? planSourceOf_(ratingAccount) : 'free'),
    ratingStatus: ratingStatusForTrip_(trip, travellerId, ratingAccount),
    proEnforced: isProEnforced(),
    profilePhotos: profilePhotoMap(),
    members: permissions.viewTravellers ? recordsForTrip('Members', tripId) : [],
    assignments: permissions.viewTravellers ? assignments : [],
    places: permissions.viewPlaces ? recordsForTrip('Places', tripId) : [],
    itinerary: permissions.viewItinerary ? recordsForTrip('Itinerary', tripId) : [],
    experiences: permissions.viewExperiences ? visibleExperiences(recordsForTrip('ExperienceNotes', tripId), accessRole, tripId, travellerId) : [],
    photos: recordsForTrip('TripPhotos', tripId).map(function(item) { const photo = Object.assign({}, item); delete photo.fileId; return photo; }),
    stickyDiary: recordsForTrip('StickyNoteDiary', tripId),
    stickyNotes: latestStickyPerTitle(recordsForTrip('StickyNotes', tripId)).map(normaliseStickyRow),
    expenses: permissions.viewExpenses ? recordsForTrip('Expenses', tripId).map(function(item) { item.amount = Number(item.amount || 0); delete item.receiptFileId; return item; }) : [],
    settlements: (permissions.viewExpenses && (accessRole === MYTRIP.roles.administrator || settleShownForTravellers_(trip))) ? recordsForTrip('Settlements', tripId).map(function(item) { item.amount = Number(item.amount || 0); return item; }) : [],
    checklist: (function() { try { return recordsForTrip('Checklist', tripId); } catch (error) { return []; } })(),
    proMembers: (function() { try { return objectsFromSheet('TravellerAccounts').filter(function(a) { return travellerPlanOf(a) === 'pro'; }).map(function(a) { return String(a.travellerId).toUpperCase(); }); } catch (error) { return []; } })(),
    proNames: (function() { try { return objectsFromSheet('TravellerAccounts').filter(function(a) { return travellerPlanOf(a) === 'pro'; }).map(function(a) { return String(a.name || '').trim().toLowerCase(); }).filter(String); } catch (error) { return []; } })()
  };
}

/** Refreshes only the screen the user opened. This keeps repeat navigation fast
 * and avoids downloading unrelated photos, diary entries or financial rows. */
function getTripSectionBundle_(tripId, accessRole, travellerId, section) {
  section = String(section || 'overview').toLowerCase();
  const permissions = permissionsFor(accessRole, tripId, travellerId);
  const data = { section: section, loadedAt: new Date().toISOString(), permissions: permissions };
  const trip = getTripRow(tripId);
  data.trip = Object.assign({}, trip);
  ['accessHash', 'adminHash', 'travellerHash', 'photoFileId', 'createdByTravellerId'].forEach(function(key) { delete data.trip[key]; });
  if (!permissions.viewExpenses) { delete data.trip.budget; data.expenses = []; data.settlements = []; }
  if (!permissions.viewItinerary) data.itinerary = [];
  if (!permissions.viewExperiences) data.experiences = [];
  if (!permissions.viewPlaces) data.places = [];
  if (!permissions.viewTravellers) { data.members = []; data.assignments = []; }
  const safeExpenses = function() { return recordsForTrip('Expenses', tripId).map(function(item) { item.amount = Number(item.amount || 0); delete item.receiptFileId; return item; }); };
  const safePhotos = function() { return recordsForTrip('TripPhotos', tripId).map(function(item) { const photo = Object.assign({}, item); delete photo.fileId; return photo; }); };
  const safeAssignments = function() { return recordsForTrip('TripAssignments', tripId).map(function(item) { const row = Object.assign({}, item); if (accessRole !== MYTRIP.roles.administrator) Object.keys(row).filter(function(key) { return /Access$|^can|photoLimit|photoQuality/i.test(key); }).forEach(function(key) { delete row[key]; }); return row; }); };
  if (section === 'overview') {
    if (permissions.viewItinerary) data.itinerary = recordsForTrip('Itinerary', tripId);
    if (permissions.viewExpenses) data.expenses = safeExpenses();
    if (permissions.viewPlaces) data.places = recordsForTrip('Places', tripId);
    if (permissions.viewExperiences) data.experiences = visibleExperiences(recordsForTrip('ExperienceNotes', tripId), accessRole, tripId, travellerId);
    data.photos = safePhotos();
    data.stickyNotes = latestStickyPerTitle(recordsForTrip('StickyNotes', tripId)).map(normaliseStickyRow);
    if (permissions.viewTravellers) data.members = recordsForTrip('Members', tripId);
  } else if (section === 'sticky') {
    data.stickyNotes = latestStickyPerTitle(recordsForTrip('StickyNotes', tripId)).map(normaliseStickyRow);
    data.stickyDiary = recordsForTrip('StickyNoteDiary', tripId);
  } else if (section === 'itinerary' && permissions.viewItinerary) data.itinerary = recordsForTrip('Itinerary', tripId);
  else if (section === 'experiences' && permissions.viewExperiences) data.experiences = visibleExperiences(recordsForTrip('ExperienceNotes', tripId), accessRole, tripId, travellerId);
  else if (section === 'photos') data.photos = safePhotos();
  else if (section === 'places' && permissions.viewPlaces) data.places = recordsForTrip('Places', tripId);
  else if (section === 'expenses' && permissions.viewExpenses) {
    data.expenses = safeExpenses();
    data.members = permissions.viewTravellers ? recordsForTrip('Members', tripId) : [];
    data.settlements = (accessRole === MYTRIP.roles.administrator || settleShownForTravellers_(getTripRow(tripId))) ? recordsForTrip('Settlements', tripId).map(function(item) { item.amount = Number(item.amount || 0); return item; }) : [];
  } else if (section === 'people' && permissions.viewTravellers) {
    data.members = recordsForTrip('Members', tripId);
    data.assignments = safeAssignments();
    data.profilePhotos = profilePhotoMap();
  } else if (section === 'checklist') data.checklist = recordsForTrip('Checklist', tripId);
  else if (section === 'print') {
    if (permissions.viewItinerary) data.itinerary = recordsForTrip('Itinerary', tripId);
    if (permissions.viewExpenses) { data.expenses = safeExpenses(); data.settlements = accessRole === MYTRIP.roles.administrator || settleShownForTravellers_(trip) ? recordsForTrip('Settlements', tripId).map(function(row) { row.amount = Number(row.amount || 0); return row; }) : []; }
    if (permissions.viewExperiences) data.experiences = visibleExperiences(recordsForTrip('ExperienceNotes', tripId), accessRole, tripId, travellerId);
    if (permissions.viewPlaces) data.places = recordsForTrip('Places', tripId);
    if (permissions.viewTravellers) data.members = recordsForTrip('Members', tripId);
    data.photos = safePhotos(); data.checklist = recordsForTrip('Checklist', tripId);
  }
  return data;
}

function permissionsFor(accessRole, tripId, travellerId) {
  const administrator = accessRole === MYTRIP.roles.administrator;
  const access = administrator || !travellerId ? allFeatureAccess(true) : travellerFeatureAccess(tripId, travellerId);
  const itinerary = featureCapabilities_(access.itineraryAccess);
  const experiences = featureCapabilities_(access.experienceAccess);
  const places = featureCapabilities_(access.placesAccess);
  const expenses = featureCapabilities_(access.expenseAccess);
  const travellers = featureCapabilities_(access.travellersAccess);
  const printing = featureCapabilities_(access.printAccess);
  const photoUsage = travellerId ? travellerPhotoUsage(tripId, travellerId) : { limit: 0, count: 0, remaining: 0 };
  const photoUploadsEnabled = tripPhotoUploadsEnabled(tripId);
  return {
    featureLevels: { itinerary: itinerary.level, experiences: experiences.level, places: places.level, expenses: expenses.level, travellers: travellers.level, print: printing.level },
    addPlan: administrator || itinerary.add,
    editPlanOwn: administrator || itinerary.editOwn,
    editPlanAll: administrator || itinerary.editAll,
    viewItinerary: administrator || itinerary.view,
    addExpense: administrator || expenses.add,
    editExpenseOwn: administrator || expenses.editOwn,
    editExpenseAll: administrator || expenses.editAll,
    viewExpenses: administrator || expenses.view,
    printExpenses: (administrator || expenses.view) && (administrator || printing.view),
    addExperience: administrator || experiences.add,
    editExperienceOwn: administrator || experiences.editOwn,
    editExperienceAll: administrator || experiences.editAll,
    viewExperiences: administrator || experiences.view,
    viewMaps: administrator || places.view,
    viewPlaces: administrator || places.view,
    addPlace: administrator || places.add,
    editPlaceOwn: administrator || places.editOwn,
    editPlaceAll: administrator || places.editAll,
    printReports: administrator || printing.view,
    viewTravellers: administrator || travellers.view,
    managePlaces: administrator || places.add,
    manageTravellers: administrator,
    manageTravellerAccounts: administrator,
    deleteTravellerAccounts: administrator,
    assignTravellers: administrator,
    editRecords: administrator || itinerary.editOwn || experiences.editOwn || places.editOwn || expenses.editOwn,
    deleteRecords: administrator,
    changePins: administrator,
    editTrip: administrator,
    deleteTrip: administrator,
    listTrips: administrator,
    listMyTrips: true,
    writeStickyNotes: administrator || stickyNoteAccessLevel('traveller', tripId, travellerId) === 'edit',
    stickyAccess: administrator ? 'edit' : stickyNoteAccessLevel('traveller', tripId, travellerId),
    viewPhotos: true,
    addPhotos: administrator || (Boolean(travellerId) && photoUploadsEnabled && photoUsage.remaining > 0),
    photoUploadsEnabled: photoUploadsEnabled,
    photoUploadLimit: administrator ? null : photoUsage.limit,
    photoUploadCount: administrator ? recordsForTrip('TripPhotos', tripId).length : photoUsage.count,
    photoUploadRemaining: administrator ? null : photoUsage.remaining
  };
}

function assertTravellerMayEditRecord_(tripId, sheetName, id, travellerId, permissions) {
  const rule = {
    Itinerary: ['editPlanOwn', 'editPlanAll'],
    ExperienceNotes: ['editExperienceOwn', 'editExperienceAll'],
    Places: ['editPlaceOwn', 'editPlaceAll'],
    Expenses: ['editExpenseOwn', 'editExpenseAll']
  }[sheetName];
  if (!rule) throw new Error('Only the Administrator may edit this type of record.');
  if (permissions[rule[1]]) return true;
  if (!permissions[rule[0]]) throw new Error('This section is view/add only. Ask the Administrator for Edit own or Full control.');
  const record = recordsForTrip(sheetName, tripId).filter(function(item) { return String(item.id) === String(id); })[0];
  if (!record) throw new Error('The record was not found in this trip.');
  if (record.createdByAccount) {
    if (String(record.createdByAccount).toLowerCase() !== ('traveller:' + travellerId).toLowerCase()) throw new Error('Edit own permits changes only to records created with this traveller account.');
    return true;
  }
  const account = getTravellerAccount(normaliseTravellerId(travellerId), false);
  const identities = [travellerId, account.travellerId, account.name].map(function(value) { return String(value || '').trim().toLowerCase(); }).filter(Boolean);
  const owners = [record.createdBy, record.writer, record.uploadedBy, record.uploaderId].map(function(value) { return String(value || '').trim().toLowerCase(); }).filter(Boolean);
  if (!owners.some(function(owner) { return identities.indexOf(owner) >= 0; })) throw new Error('Edit own permits changes only to records created by this traveller.');
  return true;
}

function listTripSummaries() {
  const members = objectsFromSheet('Members');
  const expenses = objectsFromSheet('Expenses');
  const assignments = objectsFromSheet('TripAssignments');
  const memberCountByTrip = {};
  const spentByTrip = {};
  const assignedIdsByTrip = {};
  members.forEach(function(item) { memberCountByTrip[item.tripId] = (memberCountByTrip[item.tripId] || 0) + 1; });
  expenses.forEach(function(item) { spentByTrip[item.tripId] = (spentByTrip[item.tripId] || 0) + Number(String(item.amount || 0).replace(/,/g, '')); });
  assignments.forEach(function(item) {
    if (!assignedIdsByTrip[item.tripId]) assignedIdsByTrip[item.tripId] = [];
    assignedIdsByTrip[item.tripId].push(item.travellerId);
  });
  return objectsFromSheet('Trips').map(function(trip) {
    const tripId = trip.tripId;
    const assignedIds = assignedIdsByTrip[tripId] || [];
    return {
      tripId: tripId,
      name: trip.name,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      budget: Number(String(trip.budget || 0).replace(/,/g, '')),
      currency: trip.currency || 'INR',
      createdBy: trip.createdBy,
      photoUrl: String(trip.photoUrl || ''),
      updatedAt: trip.updatedAt,
      enabled: String(trip.enabled).toUpperCase() !== 'FALSE',
      listHidden: String(trip.listHidden).toUpperCase() === 'TRUE',
      listOrder: Number.isFinite(Number(trip.listOrder)) && String(trip.listOrder) !== '' ? Number(trip.listOrder) : 0,
      travellerCount: memberCountByTrip[tripId] || 0,
      assignedTravellerCount: assignedIds.length,
      assignedTravellerIds: assignedIds.slice(),
      spent: spentByTrip[tripId] || 0
    };
  }).sort(function(a, b) {
    const orderA = a.listOrder || 0, orderB = b.listOrder || 0;
    if (orderA && orderB && orderA !== orderB) return orderA - orderB;
    if (orderA && !orderB) return -1;
    if (!orderA && orderB) return 1;
    return String(b.startDate).localeCompare(String(a.startDate));
  });
}

function listTravellerTripSummaries(travellerId) {
  travellerId = normaliseTravellerId(travellerId);
  const travellerAssignments = objectsFromSheet('TripAssignments').filter(function(item) {
    return item.travellerId === travellerId;
  });
  const assignmentByTrip = {};
  travellerAssignments.forEach(function(item) { assignmentByTrip[item.tripId] = item; });
  return listTripSummaries().filter(function(trip) {
    return trip.enabled !== false && trip.listHidden !== true && Boolean(assignmentByTrip[trip.tripId]);
  }).map(function(trip) {
    const safeTrip = Object.assign({}, trip);
    const access = featureAccessFromAssignment(assignmentByTrip[trip.tripId]);
    safeTrip.permissions = access;
    if (!access.viewExpenses) {
      delete safeTrip.budget;
      delete safeTrip.spent;
    }
    if (!access.viewTravellers) {
      delete safeTrip.travellerCount;
      delete safeTrip.assignedTravellerCount;
      delete safeTrip.assignedTravellerIds;
    }
    return safeTrip;
  });
}

function listTravellerAccounts() {
  const assignments = objectsFromSheet('TripAssignments');
  const createdCounts = travellerCreatedTripCounts();
  const tripIdsByTraveller = {};
  assignments.forEach(function(item) {
    if (!tripIdsByTraveller[item.travellerId]) tripIdsByTraveller[item.travellerId] = [];
    tripIdsByTraveller[item.travellerId].push(item.tripId);
  });
  return objectsFromSheet('TravellerAccounts').map(function(account) {
    const safe = safeTravellerAccount(account, createdCounts[account.travellerId] || 0);
    safe.tripIds = (tripIdsByTraveller[account.travellerId] || []).slice();
    safe.tripCount = safe.tripIds.length;
    return safe;
  }).sort(function(a, b) { return String(a.name).localeCompare(String(b.name)); });
}

function createTravellerAccount(input) {
  const traveller = input || {};
  const name = requiredText(traveller.name, 'Traveller name', 80);
  const pin = validateTravellerAccountPin(traveller.pin || traveller.travellerPin);
  const travellerId = traveller.travellerId ? normaliseTravellerId(traveller.travellerId) : uniqueTravellerId(name);
  if (accountUsernameMatches(travellerId, getGlobalAdminUsername())) throw new Error('That username is reserved for the Administrator account.');
  if (getTravellerAccount(travellerId, true)) throw new Error('That Traveller ID already exists.');
  const now = new Date().toISOString();
  const requestedTripLimit = typeof traveller.tripCreationLimit !== 'undefined'
    ? normaliseTripCreationLimit(traveller.tripCreationLimit)
    : (booleanSetting(traveller.canCreateTrips) ? 1 : 0);
  const phone = validateLoginPhone_(traveller.phone, true);
  const email = validateLoginEmail_(traveller.email, true);
  ensureLoginContactsAvailable_('traveller', travellerId, email, phone);
  if (booleanSetting(traveller.otpEnabled) && !email) throw new Error('Add an email address before enabling email OTP login.');
  const account = {
    travellerId: travellerId,
    name: name,
    phone: phone,
    email: email,
    otpEnabled: booleanSetting(traveller.otpEnabled) ? 'TRUE' : 'FALSE',
    emailVerifiedAt: '',
    city: cleanText(traveller.city, 80),
    emergencyContact: cleanText(traveller.emergencyContact, 120),
    notes: cleanText(traveller.notes, 1000),
    pinHash: hashTravellerAccountPin(travellerId, pin),
    active: 'TRUE',
    canCreateTrips: requestedTripLimit > 0 ? 'TRUE' : 'FALSE',
    tripCreationLimit: requestedTripLimit,
    plan: 'free',
    planExpires: '',
    planSource: 'free',
    ratingDowngradedTripId: '',
    createdAt: now,
    updatedAt: now
  };
  appendObject('TravellerAccounts', account);
  return safeTravellerAccount(account);
}

function updateTravellerAccount(travellerId, input) {
  travellerId = normaliseTravellerId(travellerId);
  const currentAccount = getTravellerAccount(travellerId, false);
  const traveller = input || {};
  const nextEmail = typeof traveller.email === 'undefined' ? currentAccount.email : validateLoginEmail_(traveller.email, true);
  const nextPhone = typeof traveller.phone === 'undefined' ? currentAccount.phone : validateLoginPhone_(traveller.phone, true);
  ensureLoginContactsAvailable_('traveller', travellerId, nextEmail, nextPhone);
  const nextOtpEnabled = typeof traveller.otpEnabled === 'undefined' ? booleanSetting(currentAccount.otpEnabled) : booleanSetting(traveller.otpEnabled);
  if (nextOtpEnabled && !nextEmail) throw new Error('Add an email address before enabling email OTP login.');
  const fields = ['name', 'phone', 'email', 'otpEnabled', 'city', 'emergencyContact', 'notes'];
  const changes = {};
  fields.forEach(function(field) {
    if (typeof traveller[field] === 'undefined') return;
    let value;
    if (field === 'name') value = requiredText(traveller[field], 'Traveller name', 80);
    else if (field === 'phone') value = nextPhone;
    else if (field === 'email') value = nextEmail;
    else if (field === 'otpEnabled') value = booleanSetting(traveller[field]) ? 'TRUE' : 'FALSE';
    else value = cleanText(traveller[field], field === 'notes' ? 1000 : (field === 'emergencyContact' ? 120 : 80));
    changes[field] = value;
  });
  if (typeof traveller.email !== 'undefined' && loginEmailKey_(currentAccount.email) !== loginEmailKey_(nextEmail)) changes.emailVerifiedAt = '';
  changes.updatedAt = new Date().toISOString();
  const nameChanged = typeof changes.name !== 'undefined' && String(changes.name) !== String(currentAccount.name || '');
  updateFieldsById_('TravellerAccounts', travellerId, changes, 'travellerId');
  const updated = Object.assign({}, currentAccount, changes);
  if (nameChanged) updateMemberNamesByTraveller_(travellerId, updated.name);
  return safeTravellerAccount(updated);
}

/* Trip owner = traveller who created the trip (createdByTravellerId).
 * An owner may reset passwords only for travellers assigned to their own trips — never the Global Administrator's. */
function tripOwnerTravellers(ownerId) {
  ownerId = normaliseTravellerId(ownerId);
  const ownTrips = objectsFromSheet('Trips').filter(function(t) { return String(t.createdByTravellerId || '').trim().toUpperCase() === ownerId; });
  const tripIds = {}; ownTrips.forEach(function(t) { tripIds[t.tripId] = t.name || t.tripId; });
  const byId = {};
  objectsFromSheet('TripAssignments').forEach(function(a) {
    if (!tripIds[a.tripId] || a.travellerId === ownerId) return;
    (byId[a.travellerId] = byId[a.travellerId] || []).push(tripIds[a.tripId]);
  });
  const accounts = objectsFromSheet('TravellerAccounts');
  return {
    ownedTrips: ownTrips.length,
    travellers: Object.keys(byId).map(function(id) {
      const acc = accounts.filter(function(x) { return x.travellerId === id; })[0] || {};
      return { travellerId: id, name: acc.name || id, trips: byId[id] };
    })
  };
}

function resetTravellerPin(travellerId, newPin) {
  travellerId = normaliseTravellerId(travellerId);
  const account = getTravellerAccount(travellerId, false);
  const pin = validateTravellerAccountPin(newPin);
  updateFieldsById_('TravellerAccounts', travellerId, { pinHash: hashTravellerAccountPin(travellerId, pin), updatedAt: new Date().toISOString() }, 'travellerId');
  account.pinHash = '';
  account.updatedAt = new Date().toISOString();
  return safeTravellerAccount(account);
}

function updateTravellerCredentials(travellerId, newTravellerId, newPin, confirmTravellerId) {
  const oldId = normaliseTravellerId(travellerId);
  if (String(confirmTravellerId || '').trim().toUpperCase() !== oldId) throw new Error('Type the current Traveller ID exactly to confirm the login change.');
  const newId = normaliseTravellerId(newTravellerId);
  if (!/^[A-Z0-9][A-Z0-9-]{2,29}$/.test(newId)) throw new Error('Traveller username must contain 3 to 30 letters, numbers or hyphens.');
  const pin = validateTravellerAccountPin(newPin);
  const account = getTravellerAccount(oldId, false);
  if (accountUsernameMatches(newId, getGlobalAdminUsername())) throw new Error('That username is reserved for the Administrator account.');
  const newIdPhoneKeys = loginPhoneKeys_(newId);
  if (phoneKeysOverlap_(newIdPhoneKeys, loginPhoneKeys_(PropertiesService.getScriptProperties().getProperty(MYTRIP.globalAdminPhoneProperty)))) throw new Error('That username matches the Administrator mobile number. Choose another username.');

  const accountConflict = objectsFromSheet('TravellerAccounts').some(function(item) {
    const itemId = String(item.travellerId || '').trim().toUpperCase();
    return itemId !== oldId && (itemId === newId || phoneKeysOverlap_(newIdPhoneKeys, loginPhoneKeys_(item.phone)));
  });
  if (accountConflict) throw new Error('That traveller username already exists.');
  if (newId !== oldId) {
    const orphanConflict = ['TripAssignments', 'Members'].some(function(sheetName) {
      return objectsFromSheet(sheetName).some(function(item) { return String(item.travellerId || '').trim().toUpperCase() === newId; });
    }) || objectsFromSheet('TripPhotos').some(function(item) { return String(item.uploaderId || '').trim().toUpperCase() === newId; });
    if (orphanConflict) throw new Error('That username is already present in trip records. Choose another username.');
  }

  const affectedTripIds = {};
  ['TripAssignments', 'Members'].forEach(function(sheetName) {
    objectsFromSheet(sheetName).filter(function(item) { return String(item.travellerId || '').trim().toUpperCase() === oldId; }).forEach(function(item) {
      if (item.tripId) affectedTripIds[item.tripId] = true;
    });
  });
  objectsFromSheet('TripPhotos').filter(function(item) { return String(item.uploaderId || '').trim().toUpperCase() === oldId; }).forEach(function(item) { if (item.tripId) affectedTripIds[item.tripId] = true; });

  updateCellById('TravellerAccounts', oldId, 'pinHash', hashTravellerAccountPin(newId, pin), 'travellerId');
  if (newId !== oldId) {
    updateCellById('TravellerAccounts', oldId, 'travellerId', newId, 'travellerId');
    replaceFieldValue('TripAssignments', 'travellerId', oldId, newId);
    replaceFieldValue('Members', 'travellerId', oldId, newId);
    replaceFieldValue('TripPhotos', 'uploaderId', oldId, newId);
  }
  updateCellById('TravellerAccounts', newId, 'updatedAt', new Date().toISOString(), 'travellerId');

  Object.keys(affectedTripIds).forEach(function(tripId) {
    try { afterMutation(tripId, 'TRAVELLER_LOGIN_UPDATED', oldId + ' → ' + newId, 'Administrator'); }
    catch (error) { console.warn('Could not record traveller login update for ' + tripId + ': ' + error.message); }
  });
  return safeTravellerAccount(getTravellerAccount(newId, false));
}

function deleteTravellerAccount(travellerId, confirmTravellerId) {
  travellerId = normaliseTravellerId(travellerId);
  if (normaliseTravellerId(confirmTravellerId) !== travellerId) throw new Error('Type the exact Traveller ID to confirm deletion.');
  const account = getTravellerAccount(travellerId, false);
  const affectedTripIds = {};
  objectsFromSheet('TripAssignments').filter(function(item) { return item.travellerId === travellerId; }).forEach(function(item) { affectedTripIds[item.tripId] = true; });
  objectsFromSheet('Members').filter(function(item) { return item.travellerId === travellerId; }).forEach(function(item) { affectedTripIds[item.tripId] = true; });

  const assignmentRows = deleteRowsMatching('TripAssignments', { travellerId: travellerId });
  const memberRows = deleteRowsMatching('Members', { travellerId: travellerId });
  const accountRows = deleteRowsMatching('TravellerAccounts', { travellerId: travellerId });
  if (accountRows !== 1) throw new Error('The traveller profile could not be deleted safely.');

  Object.keys(affectedTripIds).forEach(function(tripId) {
    try {
      afterMutation(tripId, 'TRAVELLER_PROFILE_DELETED', travellerId + ' (' + account.name + ')', 'Administrator');
    } catch (error) {
      console.warn('Could not record traveller deletion activity for ' + tripId + ': ' + error.message);
    }
  });
  return {
    deleted: true,
    travellerId: travellerId,
    name: account.name,
    assignmentRows: assignmentRows,
    memberRows: memberRows,
    affectedTrips: Object.keys(affectedTripIds)
  };
}

function setTravellerActive(travellerId, active) {
  travellerId = normaliseTravellerId(travellerId);
  getTravellerAccount(travellerId, false);
  if (active !== true && active !== false && String(active).toUpperCase() !== 'TRUE' && String(active).toUpperCase() !== 'FALSE') {
    throw new Error('Traveller account status must be true or false.');
  }
  const enabled = active === true || String(active).toUpperCase() === 'TRUE';
  updateCellById('TravellerAccounts', travellerId, 'active', enabled ? 'TRUE' : 'FALSE', 'travellerId');
  updateCellById('TravellerAccounts', travellerId, 'updatedAt', new Date().toISOString(), 'travellerId');
  return { travellerId: travellerId, active: enabled };
}

function setTravellerTripCreationAccess(travellerId, allowed) {
  travellerId = normaliseTravellerId(travellerId);
  getTravellerAccount(travellerId, false);
  if (!validBooleanSetting(allowed)) throw new Error('Trip-creation access must be true or false.');
  const enabled = booleanSetting(allowed);
  const account = getTravellerAccount(travellerId, false);
  const currentLimit = travellerTripCreationLimit(account);
  const limit = enabled ? Math.max(1, currentLimit) : 0;
  updateCellById('TravellerAccounts', travellerId, 'canCreateTrips', limit > 0 ? 'TRUE' : 'FALSE', 'travellerId');
  updateCellById('TravellerAccounts', travellerId, 'tripCreationLimit', limit, 'travellerId');
  updateCellById('TravellerAccounts', travellerId, 'updatedAt', new Date().toISOString(), 'travellerId');
  return travellerTripCreationStatus(getTravellerAccount(travellerId, false));
}

/* ---------- Free / Pro plans (v4.18.0) ----------
 * plan: 'free' | 'pro' per traveller; planExpires: optional YYYY-MM-DD.
 * MYTRIP_PRO_ENFORCED (script property): FALSE = launch mode, everyone gets every feature.
 * Later, Play Billing / Razorpay webhooks only need to call setTravellerPlan(). */
function isProEnforced() {
  return PropertiesService.getScriptProperties().getProperty('MYTRIP_PRO_ENFORCED') === 'TRUE';
}
function travellerPlanOf(account) {
  if (!account || String(account.plan || '').toLowerCase() !== 'pro') return 'free';
  const expires = account.planExpires ? new Date(account.planExpires) : null;
  if (expires && !isNaN(expires.getTime())) {
    expires.setHours(23, 59, 59, 999);
    if (expires.getTime() < Date.now()) return 'free';
  }
  return 'pro';
}
function travellerPlanFor(travellerId) {
  if (!travellerId) return 'free';
  try { return travellerPlanOf(getTravellerAccount(normaliseTravellerId(travellerId), false)); } catch (error) { return 'free'; }
}

function planSourceOf_(account) {
  const source = String(account && account.planSource || '').toLowerCase();
  if (['complimentary', 'protected', 'rating-downgraded', 'free'].indexOf(source) >= 0) return source;
  /* Existing Pro accounts pre-date this setting. Protect them until the
     Administrator explicitly changes them to Complimentary Pro. */
  return account && String(account.plan || '').toLowerCase() === 'pro' ? 'protected' : 'free';
}

function dateKeyToday_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function addDaysToDateKey_(key, days) {
  const parts = String(key || '').split('-').map(Number);
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return '';
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + Number(days || 0)));
  return Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd');
}

function dateKeyDistance_(fromKey, toKey) {
  const parse = function(key) { const p = String(key || '').split('-').map(Number); return p.length === 3 ? Date.UTC(p[0], p[1] - 1, p[2]) : NaN; };
  const from = parse(fromKey), to = parse(toKey);
  return isNaN(from) || isNaN(to) ? 0 : Math.round((to - from) / 86400000);
}

function ratingPolicyForTrip_(trip) {
  const required = String(trip && trip.ratingRequired || '').toUpperCase() === 'TRUE';
  const endDate = String(trip && trip.endDate || '').slice(0, 10);
  const today = dateKeyToday_();
  const graceRaw = Math.floor(Number(trip && trip.ratingGraceDays || 7));
  const graceDays = isFinite(graceRaw) ? Math.max(1, Math.min(30, graceRaw)) : 7;
  const completed = /^\d{4}-\d{2}-\d{2}$/.test(endDate) && today > endDate;
  const deadline = completed ? addDaysToDateKey_(endDate, graceDays) : '';
  return {
    required: required,
    completed: completed,
    graceDays: graceDays,
    deadline: deadline,
    daysRemaining: deadline ? Math.max(0, dateKeyDistance_(today, deadline)) : graceDays,
    overdue: Boolean(required && completed && deadline && today > deadline)
  };
}

function feedbackHasOverallRating_(tripId, travellerId, feedbackRows) {
  if (!travellerId) return false;
  const key = 'traveller:' + normaliseTravellerId(travellerId);
  return (feedbackRows || []).some(function(row) {
    const overall = Number(row.overall);
    return String(row.tripId) === String(tripId) && String(row.userKey) === key && overall >= 1 && overall <= 5;
  });
}

function overdueUnratedRatingTrips_(travellerId, feedbackRows) {
  const ids = {};
  objectsFromSheet('TripAssignments').forEach(function(row) {
    if (String(row.travellerId || '').toUpperCase() === String(travellerId || '').toUpperCase()) ids[String(row.tripId)] = true;
  });
  return objectsFromSheet('Trips').filter(function(trip) {
    if (!ids[String(trip.tripId)] || String(trip.enabled || 'TRUE').toUpperCase() === 'FALSE') return false;
    const policy = ratingPolicyForTrip_(trip);
    return policy.overdue && !feedbackHasOverallRating_(trip.tripId, travellerId, feedbackRows);
  });
}

function enforceRatingPlanForTraveller_(travellerId) {
  travellerId = normaliseTravellerId(travellerId);
  let account = getTravellerAccount(travellerId, false);
  const source = planSourceOf_(account);
  if (source !== 'complimentary' && source !== 'rating-downgraded') return account;
  let feedbackRows = [];
  try { feedbackRows = objectsFromSheet('Feedback'); } catch (error) {}
  const overdue = overdueUnratedRatingTrips_(travellerId, feedbackRows);
  ensureHeaders(getSpreadsheet().getSheetByName('TravellerAccounts'), MYTRIP.sheets.TravellerAccounts);
  if (source === 'complimentary' && overdue.length && travellerPlanOf(account) === 'pro') {
    updateCellById('TravellerAccounts', travellerId, 'plan', 'free', 'travellerId');
    updateCellById('TravellerAccounts', travellerId, 'planSource', 'rating-downgraded', 'travellerId');
    updateCellById('TravellerAccounts', travellerId, 'ratingDowngradedTripId', overdue[0].tripId, 'travellerId');
    updateCellById('TravellerAccounts', travellerId, 'updatedAt', new Date().toISOString(), 'travellerId');
    account = getTravellerAccount(travellerId, false);
  } else if (source === 'rating-downgraded' && !overdue.length) {
    updateCellById('TravellerAccounts', travellerId, 'plan', 'pro', 'travellerId');
    updateCellById('TravellerAccounts', travellerId, 'planSource', 'complimentary', 'travellerId');
    updateCellById('TravellerAccounts', travellerId, 'ratingDowngradedTripId', '', 'travellerId');
    updateCellById('TravellerAccounts', travellerId, 'updatedAt', new Date().toISOString(), 'travellerId');
    account = getTravellerAccount(travellerId, false);
  } else if (source === 'rating-downgraded' && overdue.length && String(account.ratingDowngradedTripId || '') !== String(overdue[0].tripId)) {
    updateCellById('TravellerAccounts', travellerId, 'ratingDowngradedTripId', overdue[0].tripId, 'travellerId');
    account = getTravellerAccount(travellerId, false);
  }
  return account;
}

function ratingStatusForTrip_(trip, travellerId, account) {
  const policy = ratingPolicyForTrip_(trip);
  let feedbackRows = [];
  try { feedbackRows = objectsFromSheet('Feedback'); } catch (error) {}
  const source = account ? planSourceOf_(account) : 'free';
  const rated = Boolean(travellerId) && feedbackHasOverallRating_(trip.tripId, travellerId, feedbackRows);
  return {
    configured: policy.required,
    required: Boolean(policy.required && travellerId),
    completed: policy.completed,
    rated: rated,
    deadline: policy.deadline,
    graceDays: policy.graceDays,
    daysRemaining: policy.daysRemaining,
    overdue: Boolean(policy.overdue && !rated),
    planSource: source,
    complimentaryPlan: source === 'complimentary' || source === 'rating-downgraded',
    protectedPlan: source === 'protected',
    downgraded: source === 'rating-downgraded',
    canRestore: source === 'rating-downgraded'
  };
}

function setTravellerPlan(travellerId, plan, planExpires, planSource) {
  travellerId = normaliseTravellerId(travellerId);
  getTravellerAccount(travellerId, false);
  ensureHeaders(getSpreadsheet().getSheetByName('TravellerAccounts'), MYTRIP.sheets.TravellerAccounts);
  plan = String(plan || '').toLowerCase() === 'pro' ? 'pro' : 'free';
  planSource = String(planSource || '').toLowerCase();
  if (plan === 'pro') planSource = planSource === 'complimentary' ? 'complimentary' : 'protected';
  else planSource = 'free';
  let expires = String(planExpires || '').slice(0, 10);
  if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) throw new Error('Expiry date must be YYYY-MM-DD.');
  if (plan === 'free') expires = '';
  updateCellById('TravellerAccounts', travellerId, 'plan', plan, 'travellerId');
  updateCellById('TravellerAccounts', travellerId, 'planExpires', expires, 'travellerId');
  updateCellById('TravellerAccounts', travellerId, 'planSource', planSource, 'travellerId');
  updateCellById('TravellerAccounts', travellerId, 'ratingDowngradedTripId', '', 'travellerId');
  updateCellById('TravellerAccounts', travellerId, 'updatedAt', new Date().toISOString(), 'travellerId');
  return safeTravellerAccount(getTravellerAccount(travellerId, false));
}

function setTravellerTripCreationLimit(travellerId, limit) {
  travellerId = normaliseTravellerId(travellerId);
  getTravellerAccount(travellerId, false);
  limit = normaliseTripCreationLimit(limit);
  updateCellById('TravellerAccounts', travellerId, 'canCreateTrips', limit > 0 ? 'TRUE' : 'FALSE', 'travellerId');
  updateCellById('TravellerAccounts', travellerId, 'tripCreationLimit', limit, 'travellerId');
  updateCellById('TravellerAccounts', travellerId, 'updatedAt', new Date().toISOString(), 'travellerId');
  const status = travellerTripCreationStatus(getTravellerAccount(travellerId, false));
  status.travellerId = travellerId;
  return status;
}

function assignTravellerToTrip(tripId, input) {
  const assignment = input || {};
  const travellerId = normaliseTravellerId(assignment.travellerId);
  const account = getTravellerAccount(travellerId, false);
  if (!isTravellerActive(account)) throw new Error('This traveller account is inactive.');
  const role = assignment.role === 'Viewer' ? 'Viewer' : 'Editor';
  const existing = objectsFromSheet('TripAssignments').filter(function(item) {
    return item.tripId === tripId && item.travellerId === travellerId;
  })[0];
  if (existing) {
    updateCellById('TripAssignments', existing.id, 'role', role);
  } else {
    appendObject('TripAssignments', { id: createId('ASN'), tripId: tripId, travellerId: travellerId, role: role, canViewItinerary: 'TRUE', canViewExperiences: 'TRUE', canViewPlaces: 'TRUE', canViewExpenses: 'TRUE', canViewTravellers: 'TRUE', canPrint: 'TRUE', canWriteStickyNotes: 'TRUE', stickyNoteAccess: 'edit', itineraryAccess: 'full', experienceAccess: 'full', placesAccess: 'full', expenseAccess: 'full', travellersAccess: 'full', printAccess: 'full', photoLimit: 0, createdAt: new Date().toISOString() });
  }

  const member = objectsFromSheet('Members').filter(function(item) {
    return item.tripId === tripId && item.travellerId === travellerId;
  })[0];
  if (member) {
    updateCellById('Members', member.id, 'name', account.name);
    updateCellById('Members', member.id, 'role', role);
  } else {
    appendObject('Members', { id: createId('MEM'), tripId: tripId, travellerId: travellerId, name: account.name, role: role, createdAt: new Date().toISOString() });
  }
  afterMutation(tripId, 'TRAVELLER_ASSIGNED', travellerId + ' (' + account.name + ')', 'Administrator');
  return { assigned: true, tripId: tripId, traveller: safeTravellerAccount(account), role: role };
}

function assignMultipleTravellersToTrip(tripId, inputs) {
  if (!Array.isArray(inputs) || !inputs.length) throw new Error('Select at least one traveller.');
  if (inputs.length > 100) throw new Error('A maximum of 100 travellers can be assigned at one time.');
  const seen = {};
  const results = [];
  inputs.forEach(function(item) {
    let traveller = typeof item === 'string' ? { travellerId: item } : (item || {});
    if (!traveller.travellerId) {
      traveller = createTravellerAccount(traveller);
    }
    const travellerId = normaliseTravellerId(traveller.travellerId);
    if (seen[travellerId]) return;
    seen[travellerId] = true;
    results.push(assignTravellerToTrip(tripId, { travellerId: travellerId, role: item && item.role }));
  });
  return { assigned: true, tripId: tripId, count: results.length, travellers: results };
}

function assignTravellerToTrips(travellerId, tripIds, role) {
  travellerId = normaliseTravellerId(travellerId);
  getTravellerAccount(travellerId, false);
  if (!Array.isArray(tripIds) || !tripIds.length) throw new Error('Select at least one trip.');
  if (tripIds.length > 100) throw new Error('A maximum of 100 trips can be assigned at one time.');
  const uniqueTripIds = [];
  tripIds.forEach(function(value) {
    const tripId = normaliseTripId(value);
    getTripRow(tripId);
    if (uniqueTripIds.indexOf(tripId) < 0) uniqueTripIds.push(tripId);
  });
  const results = uniqueTripIds.map(function(tripId) {
    return assignTravellerToTrip(tripId, { travellerId: travellerId, role: role });
  });
  return { assigned: true, travellerId: travellerId, count: results.length, trips: results };
}

function removeTravellerAssignment(tripId, travellerId) {
  travellerId = normaliseTravellerId(travellerId);
  const exists = objectsFromSheet('TripAssignments').some(function(item) {
    return item.tripId === tripId && item.travellerId === travellerId;
  });
  if (!exists) throw new Error('That traveller is not assigned to this trip.');
  const assignmentRows = deleteRowsMatching('TripAssignments', { tripId: tripId, travellerId: travellerId });
  const memberRows = deleteRowsMatching('Members', { tripId: tripId, travellerId: travellerId });
  afterMutation(tripId, 'TRAVELLER_UNASSIGNED', travellerId, 'Administrator');
  return { removed: true, tripId: tripId, travellerId: travellerId, assignmentRows: assignmentRows, memberRows: memberRows };
}

function setTravellerExpenseAccess(tripId, travellerId, allowed) {
  return setTravellerFeatureAccess(tripId, travellerId, { expenseAccess: (allowed === true || String(allowed).toUpperCase() === 'TRUE') ? 'full' : 'hidden' });
}

const MYTRIP_FEATURE_ACCESS_LEVELS_ = ['hidden', 'view', 'add', 'edit-own', 'full'];

function normaliseFeatureAccessLevel_(value, legacyAllowed) {
  const level = String(value || '').trim().toLowerCase().replace(/_/g, '-');
  if (MYTRIP_FEATURE_ACCESS_LEVELS_.indexOf(level) >= 0) return level;
  return legacyAllowed === false ? 'hidden' : 'full';
}

function featureLevelFromAssignment_(assignment, levelField, legacyField) {
  if (!assignment) return 'hidden';
  const legacyAllowed = String(assignment[legacyField]).toUpperCase() !== 'FALSE';
  return normaliseFeatureAccessLevel_(assignment[levelField], legacyAllowed);
}

function featureCapabilities_(level) {
  level = normaliseFeatureAccessLevel_(level, false);
  return {
    level: level,
    view: level !== 'hidden',
    add: ['add', 'edit-own', 'full'].indexOf(level) >= 0,
    editOwn: level === 'edit-own' || level === 'full',
    editAll: level === 'full'
  };
}

function allFeatureAccess(allowed) {
  const level = allowed ? 'full' : 'hidden';
  return { viewItinerary: allowed, viewExperiences: allowed, viewPlaces: allowed, viewExpenses: allowed, viewTravellers: allowed, printReports: allowed, writeStickyNotes: allowed, itineraryAccess: level, experienceAccess: level, placesAccess: level, expenseAccess: level, travellersAccess: level, printAccess: level };
}

/* Admin-chosen photo quality per traveller per trip: 'choice' (traveller picks), 'compressed' (always ~1 MB), 'original'. */
function photoQualityOf(assignment) {
  const q = String((assignment && assignment.photoQuality) || '').toLowerCase();
  return q === 'compressed' || q === 'original' ? q : 'choice';
}

function featureAccessFromAssignment(assignment) {
  if (!assignment) return allFeatureAccess(false);
  const itineraryAccess = featureLevelFromAssignment_(assignment, 'itineraryAccess', 'canViewItinerary');
  const experienceAccess = featureLevelFromAssignment_(assignment, 'experienceAccess', 'canViewExperiences');
  const placesAccess = featureLevelFromAssignment_(assignment, 'placesAccess', 'canViewPlaces');
  const expenseAccess = featureLevelFromAssignment_(assignment, 'expenseAccess', 'canViewExpenses');
  const travellersAccess = featureLevelFromAssignment_(assignment, 'travellersAccess', 'canViewTravellers');
  const printAccess = featureLevelFromAssignment_(assignment, 'printAccess', 'canPrint');
  return {
    viewItinerary: itineraryAccess !== 'hidden',
    viewExperiences: experienceAccess !== 'hidden',
    viewPlaces: placesAccess !== 'hidden',
    viewExpenses: expenseAccess !== 'hidden',
    viewTravellers: travellersAccess !== 'hidden',
    printReports: printAccess !== 'hidden',
    writeStickyNotes: stickyAccessFromAssignment(assignment) === 'edit',
    stickyAccess: stickyAccessFromAssignment(assignment),
    photoQuality: photoQualityOf(assignment),
    itineraryAccess: itineraryAccess,
    experienceAccess: experienceAccess,
    placesAccess: placesAccess,
    expenseAccess: expenseAccess,
    travellersAccess: travellersAccess,
    printAccess: printAccess
  };
}

function travellerFeatureAccess(tripId, travellerId) {
  travellerId = normaliseTravellerId(travellerId);
  const assignment = objectsFromSheet('TripAssignments').filter(function(item) {
    return item.tripId === tripId && item.travellerId === travellerId;
  })[0];
  return featureAccessFromAssignment(assignment);
}

function setTravellerFeatureAccess(tripId, travellerId, input) {
  travellerId = normaliseTravellerId(travellerId);
  const assignment = objectsFromSheet('TripAssignments').filter(function(item) {
    return item.tripId === tripId && item.travellerId === travellerId;
  })[0];
  if (!assignment) throw new Error('That traveller is not assigned to this trip.');
  const permissions = input || {};
  const levelFields = {
    itineraryAccess: ['itineraryAccess', 'canViewItinerary'],
    experienceAccess: ['experienceAccess', 'canViewExperiences'],
    placesAccess: ['placesAccess', 'canViewPlaces'],
    expenseAccess: ['expenseAccess', 'canViewExpenses'],
    travellersAccess: ['travellersAccess', 'canViewTravellers'],
    printAccess: ['printAccess', 'canPrint']
  };
  const fields = {
    viewItinerary: 'canViewItinerary',
    viewExperiences: 'canViewExperiences',
    viewPlaces: 'canViewPlaces',
    viewExpenses: 'canViewExpenses',
    viewTravellers: 'canViewTravellers',
    printReports: 'canPrint',
    writeStickyNotes: 'canWriteStickyNotes'
  };
  let changed = 0;
  if (typeof permissions.stickyAccess !== 'undefined') {
    setTravellerStickyAccess(tripId, travellerId, permissions.stickyAccess);
    changed++;
  }
  Object.keys(levelFields).forEach(function(permission) {
    if (typeof permissions[permission] === 'undefined') return;
    const level = normaliseFeatureAccessLevel_(permissions[permission], false);
    if (MYTRIP_FEATURE_ACCESS_LEVELS_.indexOf(String(permissions[permission] || '').trim().toLowerCase().replace(/_/g, '-')) < 0) throw new Error('Choose Hidden, View, Add, Edit own or Full control.');
    updateCellById('TripAssignments', assignment.id, levelFields[permission][0], level);
    updateCellById('TripAssignments', assignment.id, levelFields[permission][1], level === 'hidden' ? 'FALSE' : 'TRUE');
    changed++;
  });
  Object.keys(fields).forEach(function(permission) {
    const modernLevel = permission === 'viewItinerary' ? 'itineraryAccess' : permission === 'viewExperiences' ? 'experienceAccess' : permission === 'viewPlaces' ? 'placesAccess' : permission === 'viewExpenses' ? 'expenseAccess' : permission === 'viewTravellers' ? 'travellersAccess' : permission === 'printReports' ? 'printAccess' : '';
    if (modernLevel && typeof permissions[modernLevel] !== 'undefined') return;
    if (permission === 'writeStickyNotes' && typeof permissions.stickyAccess !== 'undefined') return;
    if (typeof permissions[permission] === 'undefined') return;
    const value = permissions[permission];
    if (value !== true && value !== false && String(value).toUpperCase() !== 'TRUE' && String(value).toUpperCase() !== 'FALSE') throw new Error('Feature access values must be true or false.');
    const enabled = value === true || String(value).toUpperCase() === 'TRUE';
    updateCellById('TripAssignments', assignment.id, fields[permission], enabled ? 'TRUE' : 'FALSE');
    changed++;
  });
  if (!changed) throw new Error('Choose at least one feature access setting.');
  afterMutation(tripId, 'TRAVELLER_FEATURE_ACCESS_UPDATED', travellerId, 'Administrator');
  return { tripId: tripId, travellerId: travellerId, permissions: travellerFeatureAccess(tripId, travellerId) };
}

/* ============================================================
 * Shared sticky notes — one pinned board for the whole trip
 * Access levels per traveller: 'view' | 'comment' | 'edit'
 * ============================================================ */

function stickyAccessFromAssignment(assignment) {
  if (!assignment) return 'view';
  const level = String(assignment.stickyNoteAccess || '').toLowerCase();
  if (level === 'view' || level === 'edit') return level;
  /* Blank on older rows: pinned notes are a shared board, so default to edit. */
  return String(assignment.canWriteStickyNotes).toUpperCase() === 'FALSE' ? 'view' : 'edit';
}

function stickyNoteAccessLevel(accessRole, tripId, travellerId) {
  if (accessRole === MYTRIP.roles.administrator) return 'edit';
  if (!travellerId) return 'view';
  const id = normaliseTravellerId(travellerId);
  const assignment = objectsFromSheet('TripAssignments').filter(function(item) {
    return item.tripId === tripId && item.travellerId === id;
  })[0];
  return stickyAccessFromAssignment(assignment);
}

/** One note per title per trip: the most recently saved copy. */
function latestStickyPerTitle(rows) {
  const byTitle = {};
  rows.forEach(function(row) {
    const key = String(row.title || '').trim().toLowerCase() + '|' + String(row.tripId || '');
    const stamp = String(row.updatedAt || row.createdAt || '');
    if (!byTitle[key] || stamp > String(byTitle[key].updatedAt || byTitle[key].createdAt || '')) byTitle[key] = row;
  });
  return Object.keys(byTitle).map(function(key) { return byTitle[key]; });
}

/**
 * Deletes duplicate sticky notes left by older builds (same trip + title),
 * keeping only the most recently saved copy. Those stale copies were shown in
 * place of the edited note, so text looked lost and unpinned notes came back.
 * Safe to run any number of times.
 */
function removeDuplicateStickyNotes() {
  const sheet = getSpreadsheet().getSheetByName('StickyNotes');
  if (!sheet || sheet.getLastRow() < 3) return { removed: 0 };
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const col = function(name) { return headers.indexOf(name); };
  const keep = {};
  for (let r = 1; r < values.length; r++) {
    const key = String(values[r][col('tripId')]) + '|' + String(values[r][col('title')]).trim().toLowerCase();
    const stamp = String(values[r][col('updatedAt')] || values[r][col('createdAt')] || '');
    if (!keep[key] || stamp > keep[key].stamp) keep[key] = { row: r, stamp: stamp };
  }
  const keepRows = {};
  Object.keys(keep).forEach(function(key) { keepRows[keep[key].row] = true; });
  let removed = 0;
  for (let r = values.length - 1; r >= 1; r--) {
    if (!keepRows[r]) { sheet.deleteRow(r + 1); removed++; }
  }
  if (removed) console.log('Removed ' + removed + ' duplicate sticky note(s); kept the latest copy of each.');
  return { removed: removed };
}

function normaliseStickyRow(row) {
  const note = Object.assign({}, row);
  note.pinned = String(note.pinned).toUpperCase() === 'TRUE';
  ['x', 'y', 'width', 'height'].forEach(function(field) { note[field] = Number(note[field] || 0); });
  return note;
}

function removeStickyRows(sheetName, tripId, matchField, matchValue) {
  const sheet = getSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return 0;
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return 0;
  const headers = values[0].map(String);
  const tripColumn = headers.indexOf('tripId');
  const matchColumn = headers.indexOf(matchField);
  if (matchColumn < 0) return 0;
  let removed = 0;
  for (let rowIndex = values.length - 1; rowIndex >= 1; rowIndex--) {
    const sameTrip = tripColumn < 0 || String(values[rowIndex][tripColumn]) === String(tripId);
    if (sameTrip && String(values[rowIndex][matchColumn]) === String(matchValue)) { sheet.deleteRow(rowIndex + 1); removed++; }
  }
  return removed;
}

/** Create or update a shared sticky note. Requires 'edit' access. */
function saveStickyNote(tripId, input, author, level, geometryOnly) {
  if (level !== 'edit') throw new Error('The Administrator has not allowed you to edit the pinned sticky notes.');
  const record = input || {};
  const now = new Date().toISOString();
  const dueDate = cleanText(record.dueDate, 10);
  if (dueDate) validDate(dueDate, 'Sticky due date');
  const allowedColours = ['yellow', 'rose', 'blue', 'green', 'violet'];
  const existing = objectsFromSheet('StickyNotes').filter(function(item) {
    return item.tripId === tripId && String(item.id) === String(cleanText(record.id, 80));
  })[0];
  /* A move or resize sends position only. Text, colour and due date are then
     carried over from the stored row, so dragging a note in one browser can
     never blank or roll back text another person saved. */
  const positionOnly = geometryOnly === true && Boolean(existing);
  const row = {
    id: (existing && existing.id) || cleanText(record.id, 80) || createId('STICKY'),
    tripId: tripId,
    type: positionOnly ? existing.type : (record.type === 'Reminder' ? 'Reminder' : 'Target'),
    title: positionOnly ? existing.title : requiredText(record.title, 'Sticky title', 120),
    details: positionOnly ? existing.details : cleanMultilineText(record.details || record.body, 2000),
    dueDate: positionOnly ? existing.dueDate : dueDate,
    colour: positionOnly ? existing.colour : (allowedColours.indexOf(String(record.colour || '').toLowerCase()) >= 0 ? String(record.colour).toLowerCase() : 'yellow'),
    pinned: (record.pinned === true || String(record.pinned).toUpperCase() === 'TRUE') ? 'TRUE' : 'FALSE',
    x: Math.round(Number(record.x) || 0),
    y: Math.round(Number(record.y) || 0),
    width: Math.round(Number(record.width) || 330),
    height: Math.round(Number(record.height) || 260),
    createdBy: (existing && existing.createdBy) || author,
    createdAt: (existing && existing.createdAt) || cleanText(record.createdAt, 40) || now,
    updatedBy: author,
    updatedAt: now
  };
  writeRowById('StickyNotes', row.id, row);
  afterMutation(tripId, existing ? 'STICKY_UPDATED' : 'STICKY_ADDED', row.title, author);
  return normaliseStickyRow(row);
}

/** Delete a shared sticky note and its comments. Requires 'edit' access. */
function deleteStickyNote(tripId, id, level) {
  if (level !== 'edit') throw new Error('The Administrator has not allowed you to delete pinned sticky notes.');
  const noteId = cleanText(id, 80);
  if (!noteId) throw new Error('No sticky note was supplied.');
  const removed = removeStickyRows('StickyNotes', tripId, 'id', noteId);
  if (!removed) throw new Error('That sticky note was not found in this trip.');
  afterMutation(tripId, 'STICKY_DELETED', noteId, 'Trip member');
  return { id: noteId, deleted: removed };
}

/**
 * Administrator control: who may work on the pinned sticky board.
 * travellerId may be a single Traveller ID, an array of IDs, or 'ALL'
 * to apply the same level to every traveller assigned to this trip.
 */
function setTravellerStickyAccess(tripId, travellerId, level) {
  const value = String(level || '').toLowerCase();
  if (['view', 'edit'].indexOf(value) < 0) throw new Error('Sticky access must be view or edit.');
  const assignments = objectsFromSheet('TripAssignments').filter(function(item) { return item.tripId === tripId; });
  const wanted = String(travellerId || '').toUpperCase() === 'ALL'
    ? assignments
    : (Array.isArray(travellerId) ? travellerId : [travellerId]).map(function(id) {
        const target = normaliseTravellerId(id);
        const match = assignments.filter(function(item) { return item.travellerId === target; })[0];
        if (!match) throw new Error('Traveller ' + target + ' is not assigned to this trip.');
        return match;
      });
  if (!wanted.length) throw new Error('No traveller is assigned to this trip yet.');
  wanted.forEach(function(assignment) {
    updateCellById('TripAssignments', assignment.id, 'stickyNoteAccess', value);
    updateCellById('TripAssignments', assignment.id, 'canWriteStickyNotes', value === 'edit' ? 'TRUE' : 'FALSE');
  });
  afterMutation(tripId, 'STICKY_ACCESS_UPDATED', wanted.length + ' traveller(s) set to ' + value, 'Administrator');
  return { tripId: tripId, level: value, travellers: wanted.map(function(item) { return item.travellerId; }) };
}

function addPlan(tripId, input) {
  const record = input || {};
  const row = {
    createdByAccount: cleanText(record.createdByAccount, 120),
    id: cleanText(record.id, 80) || createId('ITI'), tripId: tripId,
    date: validDate(record.date, 'Plan date'), time: cleanText(record.time, 20),
    title: requiredText(record.title, 'Plan title', 120), place: cleanText(record.place, 180),
    notes: cleanText(record.notes, 1000),
    category: cleanText(record.category, 40), status: cleanText(record.status, 40),
    bookingRef: cleanText(record.bookingRef, 80), cost: Number(record.cost) > 0 ? Number(record.cost) : '',
    sortOrder: Number.isFinite(Number(record.sortOrder)) ? Number(record.sortOrder) : 0,
    createdBy: cleanText(record.createdBy, 80), createdAt: new Date().toISOString(),
    photoUrl: normalisePhotoUrl(record.photoUrl)
  };
  ensureSheet_('Itinerary');
  appendObject('Itinerary', row);
  afterMutation(tripId, 'PLAN_ADDED', row.title, row.createdBy);
  return row;
}

function addExpense(tripId, input) {
  const record = input || {};
  const row = {
    createdByAccount: cleanText(record.createdByAccount, 120),
    id: cleanText(record.id, 80) || createId('EXP'), tripId: tripId,
    date: validDate(record.date, 'Expense date'), label: requiredText(record.label, 'Expense description', 180),
    category: cleanText(record.category, 80), paidBy: requiredText(record.paidBy, 'Paid by', 80),
    amount: positiveNumber(record.amount, 'Amount', false), notes: cleanText(record.notes, 1000),
    createdBy: cleanText(record.createdBy, 80), createdAt: new Date().toISOString(),
    sharedBy: cleanText(record.sharedBy, 600), currency: cleanText(record.currency, 8).toUpperCase(),
    foreignAmount: Number(record.foreignAmount) > 0 ? Number(record.foreignAmount) : '', fxRate: Number(record.fxRate) > 0 ? Number(record.fxRate) : '',
    source: cleanText(record.source, 30), quickPassId: cleanText(record.quickPassId, 80)
  };
  ensureSheet_('Expenses');
  appendObject('Expenses', row);
  afterMutation(tripId, 'EXPENSE_ADDED', row.label, row.createdBy);
  return row;
}

/* ---- v4.29.0–v4.31.5: personal and trip-wide revocable quick-expense links ----
 *
 * The public URL contains a long random bearer token in the URL fragment. The
 * fragment is never sent to GitHub Pages; JavaScript sends it directly to this
 * web app. Only a SHA-256 digest is stored in the spreadsheet. A valid pass can
 * work with its own expense rows only and never returns the protected trip
 * dashboard, passwords, contact details or other trip records.
 */
function quickExpenseToken_(value) {
  const token = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(token)) throw new Error('This quick-expense link is invalid. Ask the Administrator for a new link.');
  return token;
}

function quickExpenseTokenHash_(token) {
  return digestHex('MYTRIP_QUICK_EXPENSE_V1|' + quickExpenseToken_(token));
}

function quickExpenseEnabled_(value) {
  return value === true || /^(true|1|yes)$/i.test(String(value || ''));
}

function quickExpenseTripWide_(passOrTravellerId) {
  const value = passOrTravellerId && typeof passOrTravellerId === 'object' ? passOrTravellerId.travellerId : passOrTravellerId;
  return String(value || '').trim().toUpperCase() === MYTRIP_TRIP_WIDE_QUICK_EXPENSE_ID_;
}

function quickExpenseRecentLimit_(value) {
  if (String(value || '').trim().toUpperCase() === 'ALL') return 0;
  const count = Math.round(Number(value));
  return [5, 10, 50].indexOf(count) >= 0 ? count : 5;
}

function quickExpenseAllowsEdit_(pass) {
  const explicit = String(pass.allowEdit == null ? '' : pass.allowEdit).trim();
  if (explicit) return quickExpenseEnabled_(explicit);
  return Number(pass.editMinutes || 0) > 0;
}

function quickExpenseSafePass_(pass) {
  const editMinutes = Number(pass.editMinutes);
  return {
    id: pass.id, tripId: pass.tripId, travellerId: pass.travellerId,
    enabled: quickExpenseEnabled_(pass.enabled), activeFrom: String(pass.activeFrom || '').slice(0, 10), expiresAt: String(pass.expiresAt || '').slice(0, 10),
    dailyLimit: Number(pass.dailyLimit || 30), editMinutes: isFinite(editMinutes) ? editMinutes : 30,
    allowEdit: quickExpenseAllowsEdit_(pass), recentLimit: quickExpenseRecentLimit_(pass.recentLimit),
    allowAnyPayer: quickExpenseEnabled_(pass.allowAnyPayer) || quickExpenseTripWide_(pass), tripWide: quickExpenseTripWide_(pass),
    createdAt: pass.createdAt || '', updatedAt: pass.updatedAt || '', lastUsedAt: pass.lastUsedAt || ''
  };
}

function quickExpenseExpiryDate_(value) {
  if (!String(value || '').trim()) return '';
  const date = validDate(value, 'Link expiry date');
  const end = new Date(date + 'T23:59:59');
  const now = new Date();
  if (end.getTime() <= now.getTime()) throw new Error('Link expiry must be in the future.');
  if (end.getTime() - now.getTime() > 370 * 24 * 60 * 60 * 1000) throw new Error('A quick-expense link can be valid for up to one year.');
  return date;
}

function quickExpenseActiveFromDate_(value) {
  if (!String(value || '').trim()) return '';
  const date = validDate(value, 'Link active-from date');
  const start = new Date(date + 'T00:00:00');
  const now = new Date();
  if (start.getTime() - now.getTime() > 370 * 24 * 60 * 60 * 1000) throw new Error('A quick-expense link can be scheduled up to one year ahead.');
  return date;
}

function quickExpenseValidityWindow_(settings) {
  settings = settings || {};
  const activeFrom = quickExpenseActiveFromDate_(settings.activeFrom);
  const neverExpires = settings.neverExpires === true || String(settings.neverExpires).toLowerCase() === 'true';
  const expiresAt = neverExpires ? '' : quickExpenseExpiryDate_(settings.expiresAt);
  if (activeFrom && expiresAt && activeFrom > expiresAt) throw new Error('The active-from date cannot be after the valid-until date.');
  return { activeFrom: activeFrom, expiresAt: expiresAt };
}

function quickExpenseAssignment_(tripId, travellerId) {
  const assignment = objectsFromSheet('TripAssignments').filter(function(item) {
    return item.tripId === tripId && String(item.travellerId || '').toUpperCase() === travellerId;
  })[0];
  if (!assignment) throw new Error('This traveller is no longer assigned to the trip.');
  if (String(assignment.canViewExpenses).toUpperCase() === 'FALSE') throw new Error('Expense access is disabled for this traveller.');
  return assignment;
}

function quickExpensePassForToken_(rawToken, requireEditable) {
  ensureSheet_('QuickExpensePasses');
  const tokenHash = quickExpenseTokenHash_(rawToken);
  const pass = objectsFromSheet('QuickExpensePasses').filter(function(item) { return item.tokenHash === tokenHash; })[0];
  if (!pass || !quickExpenseEnabled_(pass.enabled)) throw new Error('This quick-expense link is disabled or invalid. Ask the Administrator for a new link.');
  if (pass.activeFrom) {
    const starts = new Date(String(pass.activeFrom).slice(0, 10) + 'T00:00:00');
    if (isNaN(starts.getTime()) || starts.getTime() > Date.now()) throw new Error('This quick-expense link is scheduled to open on ' + String(pass.activeFrom).slice(0, 10) + '.');
  }
  if (pass.expiresAt) {
    const expiry = new Date(String(pass.expiresAt).slice(0, 10) + 'T23:59:59');
    if (isNaN(expiry.getTime()) || expiry.getTime() < Date.now()) throw new Error('This quick-expense link has expired. Ask the Administrator to renew it.');
  }
  const trip = getTripRow(pass.tripId);
  if (String(trip.enabled).toUpperCase() === 'FALSE') throw new Error('This trip is currently disabled by the Administrator.');
  const tripWide = quickExpenseTripWide_(pass);
  let account;
  if (tripWide) {
    if (!quickExpenseMemberNames_(trip.tripId).length) throw new Error('No traveller is available for this trip-wide expense link.');
    account = { travellerId: MYTRIP_TRIP_WIDE_QUICK_EXPENSE_ID_, name: 'Trip-wide quick link', active: true };
  } else {
    const travellerId = normaliseTravellerId(pass.travellerId);
    account = getTravellerAccount(travellerId, false);
    if (!isTravellerActive(account)) throw new Error('This traveller account is inactive.');
    quickExpenseAssignment_(trip.tripId, travellerId);
  }
  if (requireEditable && (!quickExpenseAllowsEdit_(pass) || Number(pass.editMinutes || 0) <= 0)) throw new Error('Editing quick entries is disabled for this link. Ask the Administrator to make the correction.');
  return { pass: pass, trip: trip, account: account, tripWide: tripWide };
}

function quickExpenseMemberNames_(tripId) {
  const names = recordsForTrip('Members', tripId).map(function(item) { return cleanText(item.name, 80); }).filter(Boolean);
  const accountById = {};
  objectsFromSheet('TravellerAccounts').forEach(function(account) { accountById[String(account.travellerId || '').toUpperCase()] = account; });
  recordsForTrip('TripAssignments', tripId).forEach(function(assignment) {
    const account = accountById[String(assignment.travellerId || '').toUpperCase()];
    if (account && cleanText(account.name, 80)) names.push(cleanText(account.name, 80));
  });
  const seen = {};
  return names.filter(function(name) { const key = name.toLowerCase(); if (seen[key]) return false; seen[key] = true; return true; });
}

function quickExpenseSharedBy_(tripId, value) {
  const requested = String(value || '').split('|').map(function(item) { return cleanText(item, 80); }).filter(Boolean);
  if (!requested.length) return '';
  const members = quickExpenseMemberNames_(tripId);
  const allowed = {};
  members.forEach(function(name) { allowed[name.toLowerCase()] = name; });
  const selected = [];
  requested.forEach(function(name) { const safe = allowed[name.toLowerCase()]; if (safe && selected.indexOf(safe) < 0) selected.push(safe); });
  if (!selected.length) throw new Error('Choose at least one traveller to share this expense.');
  return selected.length === members.length ? '' : selected.join('|');
}

function quickExpensePaidBy_(context, value) {
  const lockedPayer = cleanText(context.account.name || context.account.travellerId, 80);
  if (!context.tripWide && !quickExpenseEnabled_(context.pass.allowAnyPayer)) return lockedPayer;
  const requested = cleanText(value, 80);
  if (!requested) throw new Error('Choose the traveller who paid this expense.');
  const members = quickExpenseMemberNames_(context.trip.tripId);
  const match = members.filter(function(name) { return name.toLowerCase() === requested.toLowerCase(); })[0];
  if (!match) throw new Error('The selected payer is not assigned to this trip. Refresh the link and try again.');
  return match;
}

function quickExpenseEnteredBy_(context, value) {
  if (!context.tripWide) return cleanText(context.account.name || context.account.travellerId, 80);
  const requested = cleanText(value, 80);
  if (!requested) return 'Trip-wide quick link';
  const members = quickExpenseMemberNames_(context.trip.tripId);
  const match = members.filter(function(name) { return name.toLowerCase() === requested.toLowerCase(); })[0];
  if (!match) throw new Error('The selected “Entered by” name is not assigned to this trip. Refresh the link and try again.');
  return match;
}

function quickExpenseCanEdit_(pass, expense) {
  const minutes = Number(pass.editMinutes || 0);
  const created = new Date(expense.createdAt || '').getTime();
  return quickExpenseAllowsEdit_(pass) && minutes > 0 && isFinite(created) && Date.now() <= created + minutes * 60 * 1000;
}

function quickExpenseSafeRow_(pass, expense) {
  return {
    id: expense.id, date: String(expense.date || '').slice(0, 10), label: expense.label || '',
    category: expense.category || '', paidBy: expense.paidBy || '', amount: Number(expense.amount || 0),
    notes: expense.notes || '', sharedBy: expense.sharedBy || '', enteredBy: expense.createdBy || '', createdAt: expense.createdAt || '',
    receiptUrl: expense.receiptUrl || '', canEdit: quickExpenseCanEdit_(pass, expense),
    editableUntil: expense.createdAt ? new Date(new Date(expense.createdAt).getTime() + Number(pass.editMinutes || 0) * 60 * 1000).toISOString() : ''
  };
}

function quickExpenseRecent_(pass) {
  const limit = quickExpenseRecentLimit_(pass.recentLimit);
  const rows = recordsForTrip('Expenses', pass.tripId).filter(function(item) { return item.quickPassId === pass.id; })
    .sort(function(a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  return (limit ? rows.slice(0, limit) : rows).map(function(item) { return quickExpenseSafeRow_(pass, item); });
}

function getQuickExpenseInfo(rawToken) {
  const context = quickExpensePassForToken_(rawToken, false);
  const pass = context.pass, trip = context.trip, account = context.account;
  return {
    trip: { tripId: trip.tripId, name: trip.name || trip.destination || 'Trip', destination: trip.destination || '', startDate: trip.startDate || '', endDate: trip.endDate || '', currency: trip.currency || 'INR', splitMembers: trip.splitMembers || '' },
    traveller: context.tripWide ? { travellerId: '', name: 'Trip-wide shared link' } : { travellerId: account.travellerId, name: account.name || account.travellerId },
    pass: quickExpenseSafePass_(pass), members: quickExpenseMemberNames_(trip.tripId),
    categories: ['Food', 'Stay', 'Travel', 'Local travel', 'Activities', 'Shopping', 'Other'], recent: quickExpenseRecent_(pass)
  };
}

function listQuickExpensePasses(tripId) {
  ensureSheet_('QuickExpensePasses');
  const assignments = recordsForTrip('TripAssignments', tripId);
  const accounts = objectsFromSheet('TravellerAccounts');
  const passes = recordsForTrip('QuickExpensePasses', tripId).map(quickExpenseSafePass_)
    .sort(function(a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  const travellers = assignments.map(function(assignment) {
    const id = String(assignment.travellerId || '').toUpperCase();
    const account = accounts.filter(function(item) { return String(item.travellerId || '').toUpperCase() === id; })[0] || {};
    return { travellerId: id, name: account.name || id, active: Boolean(account.travellerId) && isTravellerActive(account), expenseAccess: String(assignment.canViewExpenses).toUpperCase() !== 'FALSE' };
  }).filter(function(item, index, list) { return item.travellerId && list.map(function(row) { return row.travellerId; }).indexOf(item.travellerId) === index; });
  return { travellers: travellers, passes: passes };
}

function createQuickExpensePass(tripId, travellerId, rawToken, settings, client) {
  settings = settings || {};
  const tripWide = quickExpenseTripWide_(travellerId);
  travellerId = tripWide ? MYTRIP_TRIP_WIDE_QUICK_EXPENSE_ID_ : normaliseTravellerId(travellerId);
  let account;
  if (tripWide) {
    if (!quickExpenseMemberNames_(tripId).length) throw new Error('Add at least one traveller before creating a trip-wide expense link.');
    account = { travellerId: travellerId, name: 'Trip-wide shared link' };
  } else {
    account = getTravellerAccount(travellerId, false);
    if (!isTravellerActive(account)) throw new Error('This traveller account is inactive.');
    quickExpenseAssignment_(tripId, travellerId);
  }
  const token = quickExpenseToken_(rawToken);
  const tokenHash = quickExpenseTokenHash_(token);
  ensureSheet_('QuickExpensePasses');
  const id = cleanText(settings.id, 80) || createId('QXP');
  const allPasses = objectsFromSheet('QuickExpensePasses');
  const retry = allPasses.filter(function(item) { return item.id === id; })[0];
  if (retry) {
    if (retry.tripId === tripId && retry.travellerId === travellerId && retry.tokenHash === tokenHash) return { pass: quickExpenseSafePass_(retry), traveller: { travellerId: travellerId, name: account.name || travellerId } };
    throw new Error('That quick-link request ID already exists. Generate the link again.');
  }
  if (allPasses.some(function(item) { return item.tokenHash === tokenHash; })) throw new Error('This secure token already exists. Generate the link again.');
  const dailyLimit = Math.min(Math.max(Math.round(Number(settings.dailyLimit) || 30), 1), 100);
  const requestedEditMinutes = Number(settings.editMinutes);
  const editMinutes = Math.min(Math.max(Math.round(isFinite(requestedEditMinutes) ? requestedEditMinutes : 30), 0), 1440);
  const allowEdit = settings.allowEdit === undefined ? editMinutes > 0 : quickExpenseEnabled_(settings.allowEdit);
  const recentLimit = String(settings.recentLimit || '').trim().toUpperCase() === 'ALL' ? 'ALL' : quickExpenseRecentLimit_(settings.recentLimit);
  const allowAnyPayer = tripWide || settings.allowAnyPayer === true || String(settings.allowAnyPayer).toLowerCase() === 'true';
  const validity = quickExpenseValidityWindow_(settings);
  const now = new Date().toISOString();
  recordsForTrip('QuickExpensePasses', tripId).filter(function(item) {
    return item.travellerId === travellerId && quickExpenseEnabled_(item.enabled);
  }).forEach(function(item) { updateCellById('QuickExpensePasses', item.id, 'enabled', 'FALSE'); updateCellById('QuickExpensePasses', item.id, 'updatedAt', now); });
  const pass = { id: id, tripId: tripId, travellerId: travellerId, tokenHash: tokenHash, enabled: 'TRUE', activeFrom: validity.activeFrom, expiresAt: validity.expiresAt, dailyLimit: dailyLimit, editMinutes: editMinutes, allowEdit: allowEdit ? 'TRUE' : 'FALSE', recentLimit: recentLimit, allowAnyPayer: allowAnyPayer ? 'TRUE' : 'FALSE', usageDate: '', usageCount: 0, createdAt: now, createdBy: 'Administrator', updatedAt: now, lastUsedAt: '' };
  appendObject('QuickExpensePasses', pass);
  afterMutation(tripId, tripWide ? 'TRIP_WIDE_QUICK_EXPENSE_LINK_CREATED' : 'QUICK_EXPENSE_LINK_CREATED', tripWide ? 'Trip-wide shared link' : travellerId, 'Administrator');
  try { logAccessEvent_({ tripId: tripId, accountId: getGlobalAdminUsername(), accountName: 'Administrator', role: MYTRIP.roles.administrator, event: 'SHARED_LINK_CREATED', method: 'administrator control', success: true, details: tripWide ? 'Created trip-wide Quick Expense link' : 'Created personal Quick Expense link for ' + travellerId, linkPassId: pass.id, client: client }); } catch (ignored) {}
  return { pass: quickExpenseSafePass_(pass), traveller: { travellerId: travellerId, name: account.name || travellerId } };
}

function quickExpenseEnsureCanEnable_(tripId, pass) {
  if (pass.expiresAt) quickExpenseExpiryDate_(pass.expiresAt);
  if (quickExpenseTripWide_(pass)) {
    if (!quickExpenseMemberNames_(tripId).length) throw new Error('Add at least one traveller before enabling this trip-wide link.');
  } else quickExpenseAssignment_(tripId, normaliseTravellerId(pass.travellerId));
}

function quickExpenseDisableOtherPasses_(tripId, pass, now) {
  recordsForTrip('QuickExpensePasses', tripId).filter(function(item) {
    return item.id !== pass.id && item.travellerId === pass.travellerId && quickExpenseEnabled_(item.enabled);
  }).forEach(function(item) {
    updateCellById('QuickExpensePasses', item.id, 'enabled', 'FALSE');
    updateCellById('QuickExpensePasses', item.id, 'updatedAt', now);
  });
}

function updateQuickExpensePassSettings(tripId, id, settings, client) {
  ensureSheet_('QuickExpensePasses');
  settings = settings || {};
  const pass = recordsForTrip('QuickExpensePasses', tripId).filter(function(item) { return item.id === String(id); })[0];
  if (!pass) throw new Error('Quick-expense link not found.');
  const validity = quickExpenseValidityWindow_(settings);
  const dailyLimit = Math.min(Math.max(Math.round(Number(settings.dailyLimit) || 30), 1), 100);
  const requestedEditMinutes = Number(settings.editMinutes);
  const editMinutes = Math.min(Math.max(Math.round(isFinite(requestedEditMinutes) ? requestedEditMinutes : 30), 0), 1440);
  const allowEdit = settings.allowEdit === undefined ? quickExpenseAllowsEdit_(pass) : quickExpenseEnabled_(settings.allowEdit);
  const recentLimit = String(settings.recentLimit || '').trim().toUpperCase() === 'ALL' ? 'ALL' : quickExpenseRecentLimit_(settings.recentLimit || pass.recentLimit);
  const allowAnyPayer = quickExpenseTripWide_(pass) || settings.allowAnyPayer === true || String(settings.allowAnyPayer).toLowerCase() === 'true';
  const enabled = settings.enabled === undefined ? quickExpenseEnabled_(pass.enabled) : quickExpenseEnabled_(settings.enabled);
  const now = new Date().toISOString();
  const updated = Object.assign({}, pass, {
    enabled: enabled ? 'TRUE' : 'FALSE', activeFrom: validity.activeFrom, expiresAt: validity.expiresAt,
    dailyLimit: dailyLimit, editMinutes: editMinutes, allowEdit: allowEdit ? 'TRUE' : 'FALSE', recentLimit: recentLimit, allowAnyPayer: allowAnyPayer ? 'TRUE' : 'FALSE', updatedAt: now
  });
  if (enabled) { quickExpenseEnsureCanEnable_(tripId, updated); quickExpenseDisableOtherPasses_(tripId, updated, now); }
  ['enabled', 'activeFrom', 'expiresAt', 'dailyLimit', 'editMinutes', 'allowEdit', 'recentLimit', 'allowAnyPayer', 'updatedAt'].forEach(function(field) {
    updateCellById('QuickExpensePasses', pass.id, field, updated[field]);
  });
  afterMutation(tripId, 'QUICK_EXPENSE_LINK_SETTINGS_UPDATED', quickExpenseTripWide_(pass) ? 'Trip-wide shared link' : pass.travellerId, 'Administrator');
  try { logAccessEvent_({ tripId: tripId, accountId: getGlobalAdminUsername(), accountName: 'Administrator', role: MYTRIP.roles.administrator, event: enabled ? 'SHARED_LINK_PERIOD_CHANGED' : 'SHARED_LINK_PAUSED', method: 'administrator control', success: true, details: enabled ? 'Changed Quick Expense link period/settings' : 'Disabled Quick Expense link', linkPassId: pass.id, client: client }); } catch (ignored) {}
  return { pass: quickExpenseSafePass_(updated) };
}

function setQuickExpensePassEnabled(tripId, id, enabled, client) {
  ensureSheet_('QuickExpensePasses');
  const pass = recordsForTrip('QuickExpensePasses', tripId).filter(function(item) { return item.id === String(id); })[0];
  if (!pass) throw new Error('Quick-expense link not found.');
  if (enabled === true || String(enabled).toLowerCase() === 'true') {
    quickExpenseEnsureCanEnable_(tripId, pass);
    quickExpenseDisableOtherPasses_(tripId, pass, new Date().toISOString());
  }
  const value = enabled === true || String(enabled).toLowerCase() === 'true' ? 'TRUE' : 'FALSE';
  updateCellById('QuickExpensePasses', pass.id, 'enabled', value);
  updateCellById('QuickExpensePasses', pass.id, 'updatedAt', new Date().toISOString());
  try { logAccessEvent_({ tripId: tripId, accountId: getGlobalAdminUsername(), accountName: 'Administrator', role: MYTRIP.roles.administrator, event: value === 'TRUE' ? 'SHARED_LINK_RESUMED' : 'SHARED_LINK_PAUSED', method: 'administrator control', success: true, details: value === 'TRUE' ? 'Enabled Quick Expense link' : 'Disabled Quick Expense link', linkPassId: pass.id, client: client }); } catch (ignored) {}
  return { id: pass.id, enabled: value === 'TRUE' };
}

function quickExpenseDailyCount_(pass) {
  const zone = Session.getScriptTimeZone() || 'Asia/Kolkata';
  const today = Utilities.formatDate(new Date(), zone, 'yyyy-MM-dd');
  if (String(pass.usageDate || '') === today) return Math.max(0, Number(pass.usageCount || 0));
  const existing = recordsForTrip('Expenses', pass.tripId).filter(function(item) {
    if (item.quickPassId !== pass.id || !item.createdAt) return false;
    const created = new Date(item.createdAt);
    return !isNaN(created.getTime()) && Utilities.formatDate(created, zone, 'yyyy-MM-dd') === today;
  }).length;
  return existing;
}

function incrementQuickExpenseUsage_(pass, previousCount) {
  const zone = Session.getScriptTimeZone() || 'Asia/Kolkata';
  const today = Utilities.formatDate(new Date(), zone, 'yyyy-MM-dd');
  const count = Math.max(0, Number(previousCount || 0)) + 1;
  updateCellById('QuickExpensePasses', pass.id, 'usageDate', today);
  updateCellById('QuickExpensePasses', pass.id, 'usageCount', count);
  pass.usageDate = today; pass.usageCount = count;
  return count;
}

function quickExpenseRecord_(context, input, existingId) {
  const record = input || {};
  const expenseDate = validDate(record.date, 'Expense date');
  if (context.trip.startDate && expenseDate < String(context.trip.startDate).slice(0, 10)) throw new Error('Quick expenses must use a date within this trip.');
  if (context.trip.endDate && expenseDate > String(context.trip.endDate).slice(0, 10)) throw new Error('Quick expenses must use a date within this trip.');
  return {
    createdByAccount: 'quick-link:' + context.pass.id,
    id: cleanText(existingId || record.id, 80) || createId('EXP'),
    date: expenseDate, label: requiredText(record.label || record.category, 'Expense description', 180),
    category: cleanText(record.category || 'Other', 80), paidBy: quickExpensePaidBy_(context, record.paidBy),
    amount: positiveNumber(record.amount, 'Amount', false), notes: cleanText(record.notes, 1000),
    createdBy: quickExpenseEnteredBy_(context, record.enteredBy),
    sharedBy: quickExpenseSharedBy_(context.trip.tripId, record.sharedBy), source: 'quick-link', quickPassId: context.pass.id
  };
}

function quickAddExpense(rawToken, input, client) {
  const context = quickExpensePassForToken_(rawToken, false);
  const prepared = quickExpenseRecord_(context, input);
  const existing = recordsForTrip('Expenses', context.trip.tripId).filter(function(item) { return item.id === prepared.id; })[0];
  if (existing) {
    if (existing.quickPassId === context.pass.id) return { expense: quickExpenseSafeRow_(context.pass, existing), dailyRemaining: Math.max(0, Number(context.pass.dailyLimit || 30) - quickExpenseDailyCount_(context.pass)) };
    throw new Error('This expense request conflicts with an existing row. Please save again.');
  }
  const usedToday = quickExpenseDailyCount_(context.pass);
  if (usedToday >= Number(context.pass.dailyLimit || 30)) throw new Error('This link has reached its daily entry limit. Ask the Administrator to increase it or add the expense in the dashboard.');
  const row = addExpense(context.trip.tripId, prepared);
  incrementQuickExpenseUsage_(context.pass, usedToday);
  updateCellById('QuickExpensePasses', context.pass.id, 'lastUsedAt', new Date().toISOString());
  try {
    logAccessEvent_({ tripId: context.trip.tripId, accountId: context.tripWide ? 'SHARED-LINK' : context.pass.travellerId, accountName: context.tripWide ? 'Shared expense link' : (context.account.name || context.account.travellerId), role: 'shared-link', event: 'QUICK_EXPENSE_ADDED', method: 'no-login link', success: true, details: row.label + ' · Paid by ' + row.paidBy + ' · Entered by ' + (row.createdBy || 'not specified'), linkPassId: context.pass.id, client: client });
  } catch (ignored) {}
  return { expense: quickExpenseSafeRow_(context.pass, row), dailyRemaining: Math.max(0, Number(context.pass.dailyLimit || 30) - quickExpenseDailyCount_(context.pass)) };
}

function quickExpenseOwnedRow_(context, id) {
  const expense = recordsForTrip('Expenses', context.trip.tripId).filter(function(item) { return item.id === String(id) && item.quickPassId === context.pass.id; })[0];
  if (!expense) throw new Error('This expense was not created with this quick link.');
  if (!quickExpenseCanEdit_(context.pass, expense)) throw new Error('The correction window has ended. Ask the Administrator to edit this expense.');
  return expense;
}

function quickUpdateExpense(rawToken, id, input) {
  const context = quickExpensePassForToken_(rawToken, true);
  const existing = quickExpenseOwnedRow_(context, id);
  const update = quickExpenseRecord_(context, input, existing.id);
  update.createdAt = existing.createdAt; update.receiptUrl = existing.receiptUrl || ''; update.receiptFileId = existing.receiptFileId || '';
  writeRowById('Expenses', existing.id, update);
  afterMutation(context.trip.tripId, 'QUICK_EXPENSE_UPDATED', update.label, update.createdBy);
  return { expense: quickExpenseSafeRow_(context.pass, Object.assign({}, existing, update)) };
}

function quickDeleteExpense(rawToken, id) {
  const context = quickExpensePassForToken_(rawToken, true);
  const existing = quickExpenseOwnedRow_(context, id);
  if (existing.receiptFileId) { try { DriveApp.getFileById(existing.receiptFileId).setTrashed(true); } catch (error) {} }
  const removed = deleteRowsMatching('Expenses', { id: existing.id, quickPassId: context.pass.id });
  if (removed !== 1) throw new Error('The expense could not be deleted.');
  afterMutation(context.trip.tripId, 'QUICK_EXPENSE_DELETED', existing.label, existing.createdBy || context.account.name || context.account.travellerId);
  return { deleted: true, id: existing.id };
}

function quickUploadExpenseReceipt(rawToken, id, file) {
  const context = quickExpensePassForToken_(rawToken, true);
  quickExpenseOwnedRow_(context, id);
  return uploadExpenseReceipt(context.trip.tripId, id, file);
}

/** Receipt reading uses the same active link and exact history policy as the UI.
 * A caller cannot substitute a Drive file ID or access another link's records. */
function quickGetExpenseReceipt_(rawToken, id) {
  const context = quickExpensePassForToken_(rawToken, false);
  const visible = quickExpenseRecent_(context.pass);
  if (!visible.some(function(row) { return String(row.id) === String(id); })) throw new Error('This receipt is outside the history allowed for this quick link.');
  return getExpenseReceiptForScan_(context.trip.tripId, id);
}

/** Returns only a receipt belonging to an already-authorised trip expense.
 * OCR itself runs on the user's device, not in Apps Script or an OCR service. */
function getExpenseReceiptForScan_(tripId, id) {
  assertRecordBelongsToTrip('Expenses', id, tripId);
  const expense = recordsForTrip('Expenses', tripId).filter(function(row) { return String(row.id) === String(id); })[0];
  if (!expense || !expense.receiptFileId) throw new Error('No stored receipt is available. Choose the original bill photo instead.');
  const file = DriveApp.getFileById(String(expense.receiptFileId));
  if (file.isTrashed()) throw new Error('This receipt is in Drive trash. Choose the original photo instead.');
  if (file.getSize() > 6000000) throw new Error('This saved receipt is too large to scan. Choose a smaller copy.');
  const mime = file.getMimeType();
  if (['image/jpeg', 'image/png', 'image/webp'].indexOf(mime) < 0) throw new Error('Only receipt photos can be scanned.');
  return { name: file.getName(), type: mime, data: Utilities.base64Encode(file.getBlob().getBytes()) };
}

/* A settlement is money moving directly between two travellers to clear a
   Settle Up balance. It is kept in its own sheet and NOT added to Expenses,
   so it adjusts who-owes-whom without being re-split as a new trip cost. */
function addSettlement(tripId, input) {
  const record = input || {};
  const row = {
    id: cleanText(record.id, 80) || createId('SET'), tripId: tripId,
    fromPerson: requiredText(record.fromPerson, 'Who paid', 80),
    toPerson: requiredText(record.toPerson, 'Who received it', 80),
    amount: positiveNumber(record.amount, 'Amount', false),
    note: cleanText(record.note, 300),
    settledBy: cleanText(record.settledBy, 80),
    createdAt: new Date().toISOString(),
    method: cleanText(record.method, 40),
    paidOn: record.paidOn ? validDate(record.paidOn, 'Date paid') : '',
    reference: cleanText(record.reference, 60)
  };
  ensureSheet_('Settlements');
  appendObject('Settlements', row);
  afterMutation(tripId, 'SETTLEMENT_RECORDED', row.fromPerson + ' paid ' + row.toPerson + ' ' + row.amount + (row.method ? ' by ' + row.method : ''), row.settledBy);
  return row;
}

/* ---- v4.21.0: receipt photos on expenses + shared trip checklist ---- */
function ensureSheet_(name) {
  const ss = getSpreadsheet(); let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.getRange(1, 1, 1, MYTRIP.sheets[name].length).setValues([MYTRIP.sheets[name]]); sh.setFrozenRows(1); }
  else ensureHeaders(sh, MYTRIP.sheets[name]);
  return sh;
}

function uploadExpenseReceipt(tripId, id, input) {
  assertRecordBelongsToTrip('Expenses', id, tripId);
  ensureSheet_('Expenses');
  const file = input || {};
  const mimeType = cleanText(file.type, 80).toLowerCase();
  if (['image/jpeg', 'image/png', 'image/webp'].indexOf(mimeType) < 0) throw new Error('Receipt must be a JPEG, PNG or WebP image.');
  const base64 = String(file.data || '').replace(/^data:[^;]+;base64,/, '');
  if (!base64) throw new Error('Choose a receipt photo.');
  if (base64.length > 7000000) throw new Error('Receipt photo is too large. Please try again.');
  const bytes = Utilities.base64Decode(base64);
  const name = 'MyTrip-Receipt-' + tripId + '-' + id + '-' + new Date().getTime() + (mimeType === 'image/png' ? '.png' : mimeType === 'image/webp' ? '.webp' : '.jpg');
  const driveFile = saveToPhotoFolder_(Utilities.newBlob(bytes, mimeType, name), 'Receipts', tripId);
  try { driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
  catch (error) { driveFile.setTrashed(true); throw new Error('Google Drive could not make the receipt visible.'); }
  const old = objectsFromSheet('Expenses').filter(function(e) { return e.id === String(id) && e.tripId === tripId; })[0] || {};
  if (old.receiptFileId) { try { DriveApp.getFileById(old.receiptFileId).setTrashed(true); } catch (error) {} }
  const receiptUrl = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(driveFile.getId()) + '&sz=w1600';
  updateCellById('Expenses', id, 'receiptUrl', receiptUrl);
  updateCellById('Expenses', id, 'receiptFileId', driveFile.getId());
  return { id: id, receiptUrl: receiptUrl };
}

function removeExpenseReceipt(tripId, id) {
  assertRecordBelongsToTrip('Expenses', id, tripId);
  ensureSheet_('Expenses');
  const old = objectsFromSheet('Expenses').filter(function(e) { return e.id === String(id) && e.tripId === tripId; })[0] || {};
  if (old.receiptFileId) { try { DriveApp.getFileById(old.receiptFileId).setTrashed(true); } catch (error) {} }
  updateCellById('Expenses', id, 'receiptUrl', '');
  updateCellById('Expenses', id, 'receiptFileId', '');
  return { id: id, receiptUrl: '' };
}

function addChecklistItem(tripId, input) {
  ensureSheet_('Checklist');
  const record = input || {}; const now = new Date().toISOString();
  const row = {
    id: cleanText(record.id, 80) || createId('CHK'), tripId: tripId,
    text: requiredText(record.text, 'Checklist item', 200), assignee: cleanText(record.assignee, 80),
    day: record.day ? validDate(record.day, 'Day') : '', done: 'FALSE', doneBy: '',
    createdBy: cleanText(record.createdBy, 80), createdAt: now, updatedAt: now
  };
  appendObject('Checklist', row);
  return row;
}

function updateChecklistItem(tripId, id, input) {
  ensureSheet_('Checklist');
  assertRecordBelongsToTrip('Checklist', id, tripId);
  const record = input || {};
  if (typeof record.text !== 'undefined') updateCellById('Checklist', id, 'text', requiredText(record.text, 'Checklist item', 200));
  if (typeof record.assignee !== 'undefined') updateCellById('Checklist', id, 'assignee', cleanText(record.assignee, 80));
  if (typeof record.day !== 'undefined') updateCellById('Checklist', id, 'day', record.day ? validDate(record.day, 'Day') : '');
  if (typeof record.done !== 'undefined') updateCellById('Checklist', id, 'done', String(record.done).toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE');
  if (typeof record.doneBy !== 'undefined') updateCellById('Checklist', id, 'doneBy', cleanText(record.doneBy, 80));
  updateCellById('Checklist', id, 'updatedAt', new Date().toISOString());
  return { id: id };
}

function deleteChecklistItem(tripId, id) {
  const sheet = ensureSheet_('Checklist');
  const values = sheet.getDataRange().getValues(); const h = values[0];
  const ic = h.indexOf('id'), tc = h.indexOf('tripId');
  for (let r = values.length - 1; r >= 1; r--) {
    if (String(values[r][ic]) === String(id) && String(values[r][tc]) === tripId) { sheet.deleteRow(r + 1); return { id: id }; }
  }
  return { id: id };
}

/* ---- v4.22.0: re-split · invite link ---- */
function resplitExpenses(tripId, ids, sharedBy) {
  ensureSheet_('Expenses');
  const list = (Array.isArray(ids) ? ids : []).map(String);
  if (!list.length) throw new Error('Choose at least one expense.');
  const value = cleanText(sharedBy, 600);
  const own = {}; objectsFromSheet('Expenses').forEach(function(e) { if (e.tripId === tripId) own[String(e.id)] = true; });
  let n = 0;
  list.forEach(function(id) { if (own[id]) { updateCellById('Expenses', id, 'sharedBy', value); n++; } });
  return { updated: n, sharedBy: value };
}

function tripForInvite_(code) {
  code = String(code || '').trim().toUpperCase();
  if (!/^[A-Z0-9-]{6,40}$/.test(code)) throw new Error('This invite link is not valid.');
  const t = objectsFromSheet('Trips').filter(function(x) { return String(x.inviteCode || '').toUpperCase() === code; })[0];
  if (!t) throw new Error('This invite link is not valid or has been switched off.');
  if (t.inviteExpires && new Date(String(t.inviteExpires)).getTime() < Date.now()) throw new Error('This invite link has expired. Ask the Administrator for a new one.');
  if (String(t.enabled).toUpperCase() === 'FALSE') throw new Error('This trip is not open right now.');
  return t;
}

function createTripInvite(tripId, role, expires) {
  const sh = ensureSheet_('Trips');
  const trip = getTripRow(tripId);
  const prefix = String(trip.name || trip.destination || 'TRIP').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'TRP';
  const code = prefix + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
  let exp = '';
  if (expires) exp = validDate(expires, 'Invite expiry') + 'T23:59:59';
  else if (trip.endDate) exp = String(trip.endDate).slice(0, 10) + 'T23:59:59';
  else { const d = new Date(Date.now() + 30 * 86400000); exp = d.toISOString(); }
  const r = role === 'Viewer' ? 'Viewer' : 'Editor';
  updateCellById('Trips', tripId, 'inviteCode', code, 'tripId');
  updateCellById('Trips', tripId, 'inviteExpires', exp, 'tripId');
  updateCellById('Trips', tripId, 'inviteRole', r, 'tripId');
  return { inviteCode: code, inviteExpires: exp, inviteRole: r };
}

function disableTripInvite(tripId) {
  ensureSheet_('Trips');
  updateCellById('Trips', tripId, 'inviteCode', '', 'tripId');
  updateCellById('Trips', tripId, 'inviteExpires', '', 'tripId');
  return { inviteCode: '' };
}

function joinTripByInvite(body) {
  const trip = tripForInvite_(body.code);
  ensureSheet_('JoinRequests');
  const name = requiredText(body.name, 'Your name', 80);
  const pending = objectsFromSheet('JoinRequests').filter(function(j) { return j.tripId === trip.tripId && j.status === 'pending'; });
  if (pending.length >= 20) throw new Error('Too many people are waiting to join. Ask the Administrator to approve them first.');
  const account = createTravellerAccount({ name: name, pin: body.password, travellerId: body.username || '', phone: body.phone });
  const travellerId = account.travellerId || (account.traveller && account.traveller.travellerId);
  setTravellerActive(travellerId, false);
  appendObject('JoinRequests', { id: createId('JRQ'), tripId: trip.tripId, travellerId: travellerId, name: name, phone: cleanText(body.phone, 30), status: 'pending', createdAt: new Date().toISOString(), decidedAt: '' });
  return { travellerId: travellerId, tripName: trip.name || '' };
}

function listJoinRequests(tripId) {
  ensureSheet_('JoinRequests');
  const trip = getTripRow(tripId);
  return {
    invite: { inviteCode: trip.inviteCode || '', inviteExpires: trip.inviteExpires || '', inviteRole: trip.inviteRole || 'Editor' },
    requests: objectsFromSheet('JoinRequests').filter(function(j) { return j.tripId === tripId && j.status === 'pending'; })
  };
}

function decideJoinRequest(tripId, id, approve) {
  ensureSheet_('JoinRequests');
  const req = objectsFromSheet('JoinRequests').filter(function(j) { return j.id === String(id) && j.tripId === tripId; })[0];
  if (!req) throw new Error('Join request not found.');
  if (req.status !== 'pending') return { id: id, status: req.status };
  if (approve) {
    const trip = getTripRow(tripId);
    setTravellerActive(req.travellerId, true);
    assignTravellerToTrip(tripId, { travellerId: req.travellerId, role: trip.inviteRole === 'Viewer' ? 'Viewer' : 'Editor' });
  }
  updateCellById('JoinRequests', req.id, 'status', approve ? 'approved' : 'rejected');
  updateCellById('JoinRequests', req.id, 'decidedAt', new Date().toISOString());
  return { id: id, status: approve ? 'approved' : 'rejected', travellerId: req.travellerId };
}

function addPlace(tripId, input) {
  const record = input || {};
  const row = {
    createdByAccount: cleanText(record.createdByAccount, 120),
    id: cleanText(record.id, 80) || createId('PLA'), tripId: tripId,
    name: requiredText(record.name, 'Place name', 120), area: cleanText(record.area, 180),
    category: cleanText(record.category, 80), plannedDay: cleanText(record.plannedDay, 40),
    notes: cleanText(record.notes, 1000), createdBy: cleanText(record.createdBy, 80), createdAt: new Date().toISOString()
  };
  appendObject('Places', row);
  afterMutation(tripId, 'PLACE_ADDED', row.name, row.createdBy);
  return row;
}

function addExperience(tripId, input) {
  const record = input || {};
  const now = new Date().toISOString();
  const row = {
    createdByAccount: cleanText(record.createdByAccount, 120),
    id: cleanText(record.id, 80) || createId('MEMORY'),
    tripId: tripId,
    date: validDate(record.date, 'Experience date'),
    place: cleanText(record.place, 180),
    note: requiredText(record.note, 'Experience note', 4000),
    writer: requiredText(record.writer || record.createdBy, 'Writer name', 80),
    visibility: String(record.visibility || '').trim().toLowerCase() === 'only me' ? 'Only me' : 'Everyone',
    photoUrl: normalisePhotoUrl(record.photoUrl),
    noteType: String(record.noteType || '').trim().toLowerCase() === 'learning' ? 'Learning' : 'Memory',
    createdAt: now,
    updatedAt: now
  };
  ensureSheet_('ExperienceNotes');
  appendObject('ExperienceNotes', row);
  afterMutation(tripId, 'EXPERIENCE_ADDED', row.place || row.note.substring(0, 80), row.writer);
  return row;
}

function archiveStickyNote(tripId, input) {
  const record = input || {};
  const id = cleanText(record.id, 80) || createId('STICKY');
  const existing = objectsFromSheet('StickyNoteDiary').filter(function(item) {
    return item.tripId === tripId && String(item.id) === String(id);
  })[0];
  if (existing) return existing;

  const dueDate = cleanText(record.dueDate, 10);
  if (dueDate) validDate(dueDate, 'Sticky due date');
  const allowedColours = ['yellow', 'rose', 'blue', 'green', 'violet'];
  const colour = allowedColours.indexOf(String(record.colour || '').toLowerCase()) >= 0 ? String(record.colour).toLowerCase() : 'yellow';
  const row = {
    id: id,
    tripId: tripId,
    type: record.type === 'Reminder' ? 'Reminder' : 'Target',
    title: requiredText(record.title, 'Sticky title', 120),
    details: cleanMultilineText(record.details || record.body, 2000),
    dueDate: dueDate,
    colour: colour,
    createdAt: cleanText(record.createdAt, 40) || new Date().toISOString(),
    completedAt: new Date().toISOString(),
    completedBy: cleanText(record.completedBy || record.createdBy, 80) || 'Trip member'
  };
  appendObject('StickyNoteDiary', row);
  removeStickyRows('StickyNotes', tripId, 'id', row.id);
  afterMutation(tripId, 'STICKY_COMPLETED', row.title, row.completedBy);
  return row;
}

function addMember(tripId, input) {
  const record = input || {};
  const role = ['Editor', 'Viewer'].indexOf(record.role) >= 0 ? record.role : 'Editor';
  const row = { id: cleanText(record.id, 80) || createId('MEM'), tripId: tripId, name: requiredText(record.name, 'Traveller name', 80), role: role, createdAt: new Date().toISOString() };
  appendObject('Members', row);
  afterMutation(tripId, 'MEMBER_ADDED', row.name, 'Administrator');
  return row;
}

function cleanSplitMembers(value) {
  const list = Array.isArray(value) ? value : String(value || '').split('|');
  const seen = {};
  return list.map(function(name) { return cleanText(name, 80).trim(); }).filter(function(name) {
    const key = name.toLowerCase(); if (!name || seen[key]) return false; seen[key] = true; return true;
  }).join('|');
}

function ensureTripColumn(field) {
  const sheet = getSpreadsheet().getSheetByName('Trips');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  if (headers.indexOf(field) < 0) sheet.getRange(1, headers.length + 1).setValue(field);
}

function updateTrip(tripId, input) {
  const trip = input || {};
  const currentTrip = getTripRow(tripId);
  const updates = {};
  ['name', 'destination', 'startDate', 'endDate', 'budget', 'currency', 'photoUrl', 'splitMembers', 'settleVisible', 'stickyHidden', 'altCurrency', 'altRate', 'photoAlbumUrl', 'announcementEnabled', 'announcementText', 'announcementStyle', 'announcementStart', 'announcementEnd', 'announcementSpeed', 'ratingRequired', 'ratingGraceDays'].forEach(function(field) {
    if (typeof trip[field] === 'undefined') return;
    let value = trip[field];
    if (field === 'splitMembers') { updates[field] = cleanSplitMembers(value); return; }
    if (field === 'altCurrency') { updates[field] = cleanText(value, 8).toUpperCase(); return; }
    if (field === 'altRate') { const r = Number(value); updates[field] = r > 0 ? r : ''; return; }
    if (field === 'settleVisible' || field === 'stickyHidden' || field === 'announcementEnabled' || field === 'ratingRequired') { updates[field] = String(value).toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE'; return; }
    if (field === 'announcementText') { updates[field] = cleanText(value, 500); return; }
    if (field === 'announcementStyle') { value = String(value || '').toLowerCase(); updates[field] = ['warning', 'info', 'success'].indexOf(value) >= 0 ? value : 'warning'; return; }
    if (field === 'announcementSpeed') { value = String(value || '').toLowerCase(); updates[field] = ['slow', 'normal', 'fast'].indexOf(value) >= 0 ? value : 'normal'; return; }
    if (field === 'announcementStart' || field === 'announcementEnd') { updates[field] = value ? validDate(value, field === 'announcementStart' ? 'Announcement start' : 'Announcement end') : ''; return; }
    if (field === 'ratingGraceDays') { const days = Math.floor(Number(value)); if (!isFinite(days) || days < 1 || days > 30) throw new Error('Rating grace period must be from 1 to 30 days.'); updates[field] = days; return; }
    if (field === 'name') value = requiredText(value, 'Trip name', 100);
    else if (field === 'destination') value = requiredText(value, 'Destination', 120);
    else if (field === 'startDate' || field === 'endDate') value = validDate(value, field === 'startDate' ? 'Start date' : 'End date');
    else if (field === 'budget') value = positiveNumber(value, 'Budget', true);
    else if (field === 'currency') value = requiredText(value, 'Currency', 5).toUpperCase();
    else if (field === 'photoUrl') value = normalisePhotoUrl(value);
    else if (field === 'photoAlbumUrl') value = normalisePhotoUrl(value);
    updates[field] = value;
  });

  const startDate = updates.startDate || currentTrip.startDate;
  const endDate = updates.endDate || currentTrip.endDate;
  if (new Date(endDate) < new Date(startDate)) throw new Error('End date cannot be before the start date.');
  const announcementStart = Object.prototype.hasOwnProperty.call(updates, 'announcementStart') ? updates.announcementStart : currentTrip.announcementStart;
  const announcementEnd = Object.prototype.hasOwnProperty.call(updates, 'announcementEnd') ? updates.announcementEnd : currentTrip.announcementEnd;
  if (announcementStart && announcementEnd && announcementEnd < announcementStart) throw new Error('Announcement end date cannot be before its start date.');

  ['splitMembers', 'settleVisible', 'stickyHidden', 'altCurrency', 'altRate', 'photoAlbumUrl', 'announcementEnabled', 'announcementText', 'announcementStyle', 'announcementStart', 'announcementEnd', 'announcementSpeed', 'ratingRequired', 'ratingGraceDays'].forEach(function(field) { if (Object.prototype.hasOwnProperty.call(updates, field)) ensureTripColumn(field); });
  Object.keys(updates).forEach(function(field) {
    updateCellById('Trips', tripId, field, updates[field], 'tripId');
  });
  if (Object.prototype.hasOwnProperty.call(updates, 'photoUrl')) updateCellById('Trips', tripId, 'photoFileId', '', 'tripId');
  afterMutation(tripId, 'TRIP_UPDATED', '', 'Administrator');
  return getTripBundle(tripId, MYTRIP.roles.administrator).trip;
}

function uploadTripPhoto(tripId, input) {
  const file = input || {};
  const mimeType = cleanText(file.type, 80).toLowerCase();
  if (['image/jpeg', 'image/png', 'image/webp'].indexOf(mimeType) < 0) throw new Error('Trip photo must be a JPEG, PNG or WebP image.');
  const base64 = String(file.data || '').replace(/^data:[^;]+;base64,/, '');
  if (!base64) throw new Error('Choose a trip photo to upload.');
  if (base64.length > MYTRIP_PHOTO_MAX_BASE64_) throw new Error('Photo must be 20 MB or smaller.');
  let bytes;
  try { bytes = Utilities.base64Decode(base64); } catch (error) { throw new Error('The trip photo could not be decoded.'); }
  if (bytes.length > MYTRIP_PHOTO_MAX_BYTES_) throw new Error('Photo must be 20 MB or smaller.');
  const extension = mimeType === 'image/png' ? '.png' : (mimeType === 'image/webp' ? '.webp' : '.jpg');
  const originalName = cleanText(file.name, 120).replace(/[^A-Za-z0-9._-]/g, '-');
  const name = 'MyTrip-' + tripId + '-' + new Date().getTime() + (originalName ? '-' + originalName : extension);
  const driveFile = saveToPhotoFolder_(Utilities.newBlob(bytes, mimeType, name), 'Trip covers', tripId);
  try {
    driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (error) {
    driveFile.setTrashed(true);
    throw new Error('Google Drive could not make the photo visible. Your Google account may block public link sharing. Use a public HTTPS photo link instead.');
  }
  const photoUrl = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(driveFile.getId()) + '&sz=w1600';
  updateCellById('Trips', tripId, 'photoUrl', photoUrl, 'tripId');
  updateCellById('Trips', tripId, 'photoFileId', driveFile.getId(), 'tripId');
  try { saveTripThumb_(tripId, file.thumb); } catch (e) { console.warn('Thumb not saved: ' + e.message); }
  afterMutation(tripId, 'TRIP_PHOTO_UPLOADED', driveFile.getName(), 'Administrator');
  return { tripId: tripId, photoUrl: photoUrl };
}

function removeTripPhoto(tripId) {
  const trip = getTripRow(tripId);
  const fileId = cleanText(trip.photoFileId, 200);
  if (fileId) {
    try { DriveApp.getFileById(fileId).setTrashed(true); } catch (error) { console.warn('Could not move the old trip photo to trash: ' + error.message); }
  }
  updateCellById('Trips', tripId, 'photoUrl', '', 'tripId');
  updateCellById('Trips', tripId, 'photoFileId', '', 'tripId');
  afterMutation(tripId, 'TRIP_PHOTO_REMOVED', '', 'Administrator');
  return { tripId: tripId, photoUrl: '' };
}

function tripPhotoUploadsEnabled(tripId) {
  const trip = getTripRow(tripId);
  return String(typeof trip.photoUploadsEnabled === 'undefined' || trip.photoUploadsEnabled === '' ? 'TRUE' : trip.photoUploadsEnabled).toUpperCase() !== 'FALSE';
}

function travellerPhotoUsage(tripId, travellerId) {
  travellerId = normaliseTravellerId(travellerId);
  const assignment = objectsFromSheet('TripAssignments').filter(function(item) {
    return item.tripId === tripId && item.travellerId === travellerId;
  })[0];
  const limit = assignment ? Math.max(0, Math.min(50, Math.floor(Number(assignment.photoLimit || 0)))) : 0;
  const count = recordsForTrip('TripPhotos', tripId).filter(function(item) { return item.uploaderId === travellerId; }).length;
  return { limit: limit, count: count, remaining: Math.max(0, limit - count) };
}

function setTripPhotoUploadEnabled(tripId, enabled) {
  if (!validBooleanSetting(enabled)) throw new Error('Trip photo-upload access must be true or false.');
  const active = booleanSetting(enabled);
  updateCellById('Trips', tripId, 'photoUploadsEnabled', active ? 'TRUE' : 'FALSE', 'tripId');
  afterMutation(tripId, active ? 'TRIP_PHOTO_UPLOADS_ENABLED' : 'TRIP_PHOTO_UPLOADS_DISABLED', '', 'Administrator');
  return { tripId: tripId, photoUploadsEnabled: active };
}

function setTravellerPhotoLimit(tripId, travellerId, limit, quality) {
  travellerId = normaliseTravellerId(travellerId);
  const numericLimit = Number(limit);
  if (!isFinite(numericLimit) || Math.floor(numericLimit) !== numericLimit || numericLimit < 0 || numericLimit > 50) throw new Error('Photo limit must be a whole number from 0 to 50.');
  const assignment = objectsFromSheet('TripAssignments').filter(function(item) {
    return item.tripId === tripId && item.travellerId === travellerId;
  })[0];
  if (!assignment) throw new Error('That traveller is not assigned to this trip.');
  updateCellById('TripAssignments', assignment.id, 'photoLimit', numericLimit);
  if (typeof quality !== 'undefined' && quality !== null && quality !== '') { ensureHeaders(getSpreadsheet().getSheetByName('TripAssignments'), MYTRIP.sheets.TripAssignments); updateCellById('TripAssignments', assignment.id, 'photoQuality', photoQualityOf({ photoQuality: quality })); }
  afterMutation(tripId, 'TRAVELLER_PHOTO_LIMIT_UPDATED', travellerId + ' · ' + numericLimit, 'Administrator');
  return { tripId: tripId, travellerId: travellerId, photoLimit: numericLimit, usage: travellerPhotoUsage(tripId, travellerId) };
}

function createTripGalleryDriveFile(tripId, input) {
  const file = input || {};
  const mimeType = cleanText(file.type, 80).toLowerCase();
  if (['image/jpeg', 'image/png', 'image/webp'].indexOf(mimeType) < 0) throw new Error('Trip photo must be a JPEG, PNG or WebP image.');
  const base64 = String(file.data || '').replace(/^data:[^;]+;base64,/, '');
  if (!base64) throw new Error('Choose a trip photo to upload.');
  if (base64.length > MYTRIP_PHOTO_MAX_BASE64_) throw new Error('Photo must be 20 MB or smaller.');
  let bytes;
  try { bytes = Utilities.base64Decode(base64); } catch (error) { throw new Error('The trip photo could not be decoded.'); }
  if (bytes.length > MYTRIP_PHOTO_MAX_BYTES_) throw new Error('Photo must be 20 MB or smaller.');
  const extension = mimeType === 'image/png' ? '.png' : (mimeType === 'image/webp' ? '.webp' : '.jpg');
  const originalName = cleanText(file.name, 120).replace(/[^A-Za-z0-9._-]/g, '-');
  const name = 'MyTrip-Gallery-' + tripId + '-' + new Date().getTime() + (originalName ? '-' + originalName : extension);
  const driveFile = saveToPhotoFolder_(Utilities.newBlob(bytes, mimeType, name), 'Trip gallery', tripId);
  try {
    driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (error) {
    driveFile.setTrashed(true);
    throw new Error('Google Drive could not make the photo visible. Your Google account may block public link sharing.');
  }
  return { file: driveFile, photoUrl: 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(driveFile.getId()) + '&sz=w1600' };
}

function photoActor(accessRole, travellerId) {
  if (accessRole === MYTRIP.roles.administrator) return { uploaderId: '', uploadedBy: 'Administrator' };
  if (!travellerId) throw new Error('Sign in with a personal traveller username to manage photos.');
  const account = getTravellerAccount(normaliseTravellerId(travellerId), false);
  return { uploaderId: account.travellerId, uploadedBy: account.name };
}

function assertTravellerMayUploadPhoto(tripId, accessRole, travellerId, replacing) {
  if (accessRole === MYTRIP.roles.administrator) return;
  if (!travellerId) throw new Error('Shared trip access cannot add or replace photos. Sign in with your personal username.');
  if (!tripPhotoUploadsEnabled(tripId)) throw new Error('Photo addition is disabled for this trip by the Administrator.');
  const usage = travellerPhotoUsage(tripId, travellerId);
  if (usage.limit < 1) throw new Error('The Administrator has disabled photo addition for your account in this trip.');
  if (!replacing && usage.remaining < 1) throw new Error('You have reached your photo limit for this trip. Delete one of your photos or ask the Administrator to increase the limit.');
}

function assertPhotoQualityAllowed(tripId, accessRole, travellerId, input) {
  if (accessRole === MYTRIP.roles.administrator || !travellerId) return;
  const id = normaliseTravellerId(travellerId);
  const assignment = objectsFromSheet('TripAssignments').filter(function(a) { return a.tripId === tripId && a.travellerId === id; })[0];
  if (photoQualityOf(assignment) !== 'compressed') return;
  const base64 = String((input && input.data) || '').replace(/^data:[^;]+;base64,/, '');
  if (base64.length > 4800000) throw new Error('The Administrator allows only compressed photos for you. Please upload the smaller version.');
}

function uploadTripMemoryPhoto(tripId, input, caption, accessRole, travellerId) {
  assertTravellerMayUploadPhoto(tripId, accessRole, travellerId, false);
  assertPhotoQualityAllowed(tripId, accessRole, travellerId, input);
  const actor = photoActor(accessRole, travellerId);
  const saved = createTripGalleryDriveFile(tripId, input);
  const now = new Date().toISOString();
  const row = {
    id: createId('PHOTO'), tripId: tripId, fileId: saved.file.getId(), photoUrl: saved.photoUrl,
    caption: cleanText(caption, 240), uploadedBy: actor.uploadedBy, uploaderId: actor.uploaderId,
    createdAt: now, updatedAt: now
  };
  try { appendObject('TripPhotos', row); }
  catch (error) { try { saved.file.setTrashed(true); } catch (trashError) {} throw error; }
  afterMutation(tripId, 'TRIP_GALLERY_PHOTO_ADDED', row.id, actor.uploadedBy);
  const safe = Object.assign({}, row); delete safe.fileId;
  return { photo: safe, usage: actor.uploaderId ? travellerPhotoUsage(tripId, actor.uploaderId) : null };
}

function getTripMemoryPhoto(tripId, photoId) {
  const photo = recordsForTrip('TripPhotos', tripId).filter(function(item) { return String(item.id) === String(photoId); })[0];
  if (!photo) throw new Error('That trip photo was not found.');
  return photo;
}

function assertPhotoOwner(photo, accessRole, travellerId) {
  if (accessRole === MYTRIP.roles.administrator) return;
  if (!travellerId || photo.uploaderId !== normaliseTravellerId(travellerId)) throw new Error('You can manage only photos that you personally uploaded.');
}

function replaceTripMemoryPhoto(tripId, photoId, input, caption, accessRole, travellerId) {
  const current = getTripMemoryPhoto(tripId, photoId);
  assertPhotoOwner(current, accessRole, travellerId);
  assertTravellerMayUploadPhoto(tripId, accessRole, travellerId, true);
  const saved = createTripGalleryDriveFile(tripId, input);
  try {
    updateCellById('TripPhotos', current.id, 'fileId', saved.file.getId());
    updateCellById('TripPhotos', current.id, 'photoUrl', saved.photoUrl);
    updateCellById('TripPhotos', current.id, 'caption', cleanText(caption, 240));
    updateCellById('TripPhotos', current.id, 'updatedAt', new Date().toISOString());
  } catch (error) {
    try { saved.file.setTrashed(true); } catch (trashError) {}
    throw error;
  }
  if (current.fileId) try { DriveApp.getFileById(current.fileId).setTrashed(true); } catch (error) { console.warn('Could not move the replaced photo to trash: ' + error.message); }
  afterMutation(tripId, 'TRIP_GALLERY_PHOTO_REPLACED', current.id, accessRole === MYTRIP.roles.administrator ? 'Administrator' : current.uploadedBy);
  const updated = getTripMemoryPhoto(tripId, current.id); delete updated.fileId;
  return { photo: updated, usage: travellerId ? travellerPhotoUsage(tripId, travellerId) : null };
}

function deleteTripMemoryPhoto(tripId, photoId, accessRole, travellerId) {
  const photo = getTripMemoryPhoto(tripId, photoId);
  assertPhotoOwner(photo, accessRole, travellerId);
  if (photo.fileId) try { DriveApp.getFileById(photo.fileId).setTrashed(true); } catch (error) { console.warn('Could not move the deleted photo to trash: ' + error.message); }
  deleteRowsMatching('TripPhotos', { id: photo.id, tripId: tripId });
  afterMutation(tripId, 'TRIP_GALLERY_PHOTO_DELETED', photo.id, accessRole === MYTRIP.roles.administrator ? 'Administrator' : photo.uploadedBy);
  return { deleted: true, photoId: photo.id, usage: travellerId ? travellerPhotoUsage(tripId, travellerId) : null };
}

/**
 * Hides a trip from every trip list, on every device and for every login.
 * Travellers stop receiving it entirely; the Administrator still sees it
 * under "Show hidden" so it can be restored.
 */
/* ---- profile photos: small square thumbnails kept in Google Drive ---- */

/** { ADMIN: url, TRAVELLERID: url, ... } — everyone who has a photo. */
function profilePhotoMap() {
  const map = {};
  const adminUrl = PropertiesService.getScriptProperties().getProperty(MYTRIP.adminPhotoProperty);
  if (adminUrl) map.ADMIN = adminUrl;
  objectsFromSheet('TravellerAccounts').forEach(function(account) {
    if (account.photoUrl) map[String(account.travellerId).toUpperCase()] = account.photoUrl;
  });
  return map;
}

function saveProfilePhoto(target, travellerId, input, remove) {
  const properties = PropertiesService.getScriptProperties();
  const previousFile = target === 'admin'
    ? properties.getProperty(MYTRIP.adminPhotoFileProperty)
    : (objectsFromSheet('TravellerAccounts').filter(function(item) { return String(item.travellerId).toUpperCase() === travellerId; })[0] || {}).photoFileId;
  const trashPrevious = function() { if (previousFile) { try { DriveApp.getFileById(previousFile).setTrashed(true); } catch (error) {} } };

  if (remove) {
    trashPrevious();
    if (target === 'admin') { properties.deleteProperty(MYTRIP.adminPhotoProperty); properties.deleteProperty(MYTRIP.adminPhotoFileProperty); }
    else { updateCellById('TravellerAccounts', travellerId, 'photoUrl', '', 'travellerId'); updateCellById('TravellerAccounts', travellerId, 'photoFileId', '', 'travellerId'); }
    return { target: target, travellerId: travellerId, photoUrl: '' };
  }

  const file = input || {};
  const mimeType = cleanText(file.type, 80).toLowerCase();
  if (['image/jpeg', 'image/png', 'image/webp'].indexOf(mimeType) < 0) throw new Error('Profile photo must be a JPEG, PNG or WebP image.');
  const base64 = String(file.data || '').replace(/^data:[^;]+;base64,/, '');
  if (!base64) throw new Error('Choose a photo to upload.');
  if (base64.length > 700000) throw new Error('Profile photo is too large.');
  let bytes;
  try { bytes = Utilities.base64Decode(base64); } catch (error) { throw new Error('The photo could not be decoded.'); }
  const name = 'MyTrip-profile-' + (target === 'admin' ? 'ADMIN' : travellerId) + '-' + new Date().getTime() + '.jpg';
  const driveFile = saveToPhotoFolder_(Utilities.newBlob(bytes, mimeType, name), 'Profile photos', '');
  try { driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
  catch (error) { driveFile.setTrashed(true); throw new Error('Google Drive could not share the photo. Your Google account may block link sharing.'); }
  const photoUrl = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(driveFile.getId()) + '&sz=w256';
  if (target === 'admin') {
    properties.setProperty(MYTRIP.adminPhotoProperty, photoUrl);
    properties.setProperty(MYTRIP.adminPhotoFileProperty, driveFile.getId());
  } else {
    if (!objectsFromSheet('TravellerAccounts').some(function(item) { return String(item.travellerId).toUpperCase() === travellerId; })) { driveFile.setTrashed(true); throw new Error('Traveller ' + travellerId + ' was not found.'); }
    updateCellById('TravellerAccounts', travellerId, 'photoUrl', photoUrl, 'travellerId');
    updateCellById('TravellerAccounts', travellerId, 'photoFileId', driveFile.getId(), 'travellerId');
  }
  trashPrevious();
  return { target: target, travellerId: travellerId, photoUrl: photoUrl };
}

function setTripListHidden(tripId, hidden) {
  const value = (hidden === true || String(hidden).toUpperCase() === 'TRUE') ? 'TRUE' : 'FALSE';
  const sheet = getSpreadsheet().getSheetByName('Trips');
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const idColumn = headers.indexOf('tripId');
  const hiddenColumn = headers.indexOf('listHidden');
  if (hiddenColumn < 0) throw new Error('Run setupMyTrip() once to add the listHidden column.');
  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    if (String(values[rowIndex][idColumn]) === String(tripId)) {
      sheet.getRange(rowIndex + 1, hiddenColumn + 1).setValue(value);
      return { tripId: tripId, listHidden: value === 'TRUE' };
    }
  }
  throw new Error('That trip was not found.');
}

/**
 * Stores the shared trip order. Pass an array of trip IDs in the wanted
 * order, or [] to clear it and return to newest-trip-first.
 */
function setTripListOrder(order) {
  const wanted = Array.isArray(order) ? order.map(function(id) { return cleanText(id, 40).toUpperCase(); }).filter(Boolean) : [];
  const sheet = getSpreadsheet().getSheetByName('Trips');
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const idColumn = headers.indexOf('tripId');
  const orderColumn = headers.indexOf('listOrder');
  if (orderColumn < 0) throw new Error('Run setupMyTrip() once to add the listOrder column.');
  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    const tripId = String(values[rowIndex][idColumn]).toUpperCase();
    const position = wanted.indexOf(tripId);
    sheet.getRange(rowIndex + 1, orderColumn + 1).setValue(position < 0 ? '' : (position + 1) * 10);
  }
  return { order: wanted };
}

function setTripEnabled(tripId, enabled) {
  if (enabled !== true && enabled !== false && String(enabled).toUpperCase() !== 'TRUE' && String(enabled).toUpperCase() !== 'FALSE') {
    throw new Error('Trip status must be true or false.');
  }
  const active = enabled === true || String(enabled).toUpperCase() === 'TRUE';
  updateCellById('Trips', tripId, 'enabled', active ? 'TRUE' : 'FALSE', 'tripId');
  afterMutation(tripId, active ? 'TRIP_ENABLED' : 'TRIP_DISABLED', '', 'Administrator');
  return { tripId: tripId, enabled: active };
}

function deleteTrip(tripId, confirmTripId) {
  const confirmation = normaliseTripId(confirmTripId);
  if (confirmation !== tripId) throw new Error('To delete this trip, enter its exact trip code as confirmation.');

  const trip = getTripRow(tripId);
  recordsForTrip('TripPhotos', tripId).forEach(function(photo) {
    if (photo.fileId) try { DriveApp.getFileById(photo.fileId).setTrashed(true); } catch (error) { console.warn('Could not move a trip gallery photo to trash: ' + error.message); }
  });
  const deleted = {};
  ['Members', 'Places', 'Itinerary', 'ExperienceNotes', 'TripPhotos', 'StickyNoteDiary', 'StickyNotes', 'Expenses', 'QuickExpensePasses', 'TripAssignments', 'Activity'].forEach(function(sheetName) {
    deleted[sheetName] = deleteRowsForTrip(sheetName, tripId);
  });
  deleted.Trips = deleteRowsForTrip('Trips', tripId);
  if (deleted.Trips !== 1) throw new Error('The trip could not be deleted completely.');

  try {
    appendObject('Activity', {
      id: createId('ACT'),
      tripId: tripId,
      action: 'TRIP_DELETED',
      details: String(trip.name || '') + ' — all trip records deleted',
      createdBy: 'Administrator',
      createdAt: new Date().toISOString()
    });
  } catch (auditError) {
    console.error('Trip was deleted, but the deletion audit could not be saved: ' + auditError.message);
  }
  return { deleted: true, tripId: tripId, name: trip.name, deletedRows: deleted };
}

function deleteRowsForTrip(sheetName, tripId) {
  const sheet = getSpreadsheet().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const tripColumn = headers.indexOf('tripId');
  if (tripColumn < 0) throw new Error('Data column is missing: tripId in ' + sheetName + '. Run setupMyTrip() once.');

  let deleted = 0;
  for (let row = values.length - 1; row >= 1; row--) {
    if (String(values[row][tripColumn]) === tripId) {
      sheet.deleteRow(row + 1);
      deleted++;
    }
  }
  if (deleted) invalidateObjectRows_(sheetName);
  return deleted;
}

function deleteRowsMatching(sheetName, criteria) {
  const sheet = getSpreadsheet().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const fields = Object.keys(criteria || {});
  fields.forEach(function(field) {
    if (headers.indexOf(field) < 0) throw new Error('Data column is missing: ' + field + ' in ' + sheetName + '. Run setupMyTrip() once.');
  });

  let deleted = 0;
  for (let row = values.length - 1; row >= 1; row--) {
    const matches = fields.every(function(field) {
      return String(values[row][headers.indexOf(field)]) === String(criteria[field]);
    });
    if (matches) {
      sheet.deleteRow(row + 1);
      deleted++;
    }
  }
  if (deleted) invalidateObjectRows_(sheetName);
  return deleted;
}

function updateRecord(tripId, sheetName, id, input, accessRole) {
  const allowedFields = {
    Itinerary: ['date', 'time', 'title', 'place', 'notes', 'category', 'status', 'bookingRef', 'cost', 'sortOrder', 'photoUrl'],
    ExperienceNotes: ['date', 'place', 'note', 'writer', 'visibility', 'photoUrl', 'noteType'],
    Places: ['name', 'area', 'category', 'plannedDay', 'notes'],
    Expenses: ['date', 'label', 'category', 'paidBy', 'amount', 'notes', 'sharedBy', 'currency', 'foreignAmount', 'fxRate'],
    Members: ['name', 'role'],
    TripPhotos: ['caption']
  };
  if (!allowedFields[sheetName]) throw new Error('That record type cannot be edited.');
  if (sheetName === 'Members' && accessRole !== MYTRIP.roles.administrator) throw new Error('Administrator access is required to edit trip members.');
  assertRecordBelongsToTrip(sheetName, id, tripId);
  const record = input || {};
  allowedFields[sheetName].forEach(function(field) {
    if (typeof record[field] === 'undefined') return;
    let value = record[field];
    if (field === 'date') value = validDate(value, 'Date');
    else if (field === 'amount') value = positiveNumber(value, 'Amount', false);
    else if (field === 'note') value = requiredText(value, 'Experience note', 4000);
    else if (field === 'writer') value = requiredText(value, 'Writer name', 80);
    else if (field === 'visibility') value = String(value).trim().toLowerCase() === 'only me' ? 'Only me' : 'Everyone';
    else if (field === 'photoUrl') value = normalisePhotoUrl(value);
    else if (field === 'noteType') value = String(value).trim().toLowerCase() === 'learning' ? 'Learning' : 'Memory';
    else value = cleanText(value, field === 'notes' ? 1000 : 180);
    updateCellById(sheetName, id, field, value);
  });
  if (sheetName === 'ExperienceNotes') updateCellById(sheetName, id, 'updatedAt', new Date().toISOString());
  afterMutation(tripId, 'RECORD_UPDATED', sheetName + ':' + id, accessRole === MYTRIP.roles.administrator ? 'Administrator' : 'Traveller');
  return { updated: true, id: id, sheet: sheetName };
}

function deleteRecord(tripId, sheetName, id) {
  if (['Members', 'Places', 'Itinerary', 'ExperienceNotes', 'StickyNoteDiary', 'StickyNotes', 'Expenses', 'Settlements'].indexOf(sheetName) < 0) throw new Error('That record type cannot be deleted.');
  const sheet = getSpreadsheet().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idColumn = headers.indexOf('id');
  const tripColumn = headers.indexOf('tripId');
  const roleColumn = headers.indexOf('role');
  for (let row = values.length - 1; row >= 1; row--) {
    if (String(values[row][idColumn]) === String(id) && String(values[row][tripColumn]) === tripId) {
      if (sheetName === 'Members' && roleColumn >= 0 && String(values[row][roleColumn]) === 'Organiser') throw new Error('The trip organiser cannot be removed.');
      sheet.deleteRow(row + 1);
      invalidateObjectRows_(sheetName);
      afterMutation(tripId, 'RECORD_DELETED', sheetName + ':' + id, 'Administrator');
      return { deleted: true, id: id, sheet: sheetName };
    }
  }
  throw new Error('The record was not found.');
}

function changePins(tripId, adminUsername, adminPin, travellerPin) {
  adminUsername = normaliseAccountUsername(adminUsername || getGlobalAdminUsername());
  adminPin = String(adminPin || '');
  travellerPin = String(travellerPin || '');
  validateAccessSecrets(adminPin, travellerPin);
  ensureAdministratorUsernameAvailable(adminUsername);
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty(MYTRIP.globalAdminUsernameProperty, adminUsername);
  properties.setProperty(MYTRIP.globalAdminHashProperty, hashGlobalAdministrator(adminPin));
  updateCellById('Trips', tripId, 'adminHash', '', 'tripId');
  updateCellById('Trips', tripId, 'travellerHash', hashPin(tripId, travellerPin, MYTRIP.roles.traveller), 'tripId');
  updateCellById('Trips', tripId, 'accessHash', '', 'tripId');
  afterMutation(tripId, 'ACCESS_CHANGED', 'Administrator username/password and this trip shared password replaced', 'Administrator');
  return { changed: true, accessRole: MYTRIP.roles.administrator, username: adminUsername };
}

function changeAdministratorLogin(newUsername, newPassword, email, phone, otpEnabled) {
  newUsername = ensureAdministratorUsernameAvailable(newUsername);
  newPassword = String(newPassword || '');
  validateAdministratorSecret(newPassword);
  email = validateLoginEmail_(email, true);
  phone = validateLoginPhone_(phone, true);
  ensureLoginContactsAvailable_('administrator', newUsername, email, phone);
  if (booleanSetting(otpEnabled) && !email) throw new Error('Add an email address before enabling email OTP login.');
  const properties = PropertiesService.getScriptProperties();
  const previousEmail = properties.getProperty(MYTRIP.globalAdminEmailProperty) || '';
  const replacements = {};
  replacements[MYTRIP.globalAdminUsernameProperty] = newUsername;
  replacements[MYTRIP.globalAdminHashProperty] = hashGlobalAdministrator(newPassword);
  replacements[MYTRIP.globalAdminEmailProperty] = email;
  replacements[MYTRIP.globalAdminPhoneProperty] = phone;
  replacements[MYTRIP.globalAdminOtpEnabledProperty] = booleanSetting(otpEnabled) ? 'TRUE' : 'FALSE';
  if (loginEmailKey_(previousEmail) !== loginEmailKey_(email)) replacements[MYTRIP.globalAdminEmailVerifiedProperty] = '';
  properties.setProperties(replacements, false);
  return { changed: true, accessRole: MYTRIP.roles.administrator, account: administratorSafeAccount_() };
}

function verifyAccess(tripId, pin, travellerId, username) {
  pin = String(pin || '');
  const trip = getTripRow(tripId);
  const globalHash = getGlobalAdminHash();
  if (globalHash && accountUsernameMatches(username, getGlobalAdminUsername()) && (globalHash === hashGlobalAdministrator(pin) || verifyAccountSession_(pin, MYTRIP.roles.administrator, getGlobalAdminUsername(), globalHash))) return MYTRIP.roles.administrator;
  if (String(trip.enabled).toUpperCase() === 'FALSE') throw new Error('This trip is disabled by the Administrator.');
  if (cleanText(travellerId, 30)) {
    const account = verifyTravellerAccount(travellerId, pin);
    const assigned = objectsFromSheet('TripAssignments').some(function(item) {
      return item.tripId === tripId && item.travellerId === account.travellerId;
    });
    if (!assigned) throw new Error('This trip is not assigned to that traveller.');
    return MYTRIP.roles.traveller;
  }
  if (trip.travellerHash && trip.travellerHash === hashPin(tripId, pin, MYTRIP.roles.traveller)) return MYTRIP.roles.traveller;
  if (!globalHash && trip.adminHash && trip.adminHash === hashPin(tripId, pin, MYTRIP.roles.administrator)) {
    adoptLegacyAdministrator(username, pin);
    return MYTRIP.roles.administrator;
  }
  if (!globalHash && trip.accessHash && trip.accessHash === hashLegacyPin(tripId, pin)) {
    adoptLegacyAdministrator(username, pin);
    return MYTRIP.roles.administrator;
  }
  throw new Error('Incorrect username or password.');
}

function authenticateAccount(identifier, password) {
  identifier = cleanText(identifier, 120);
  password = String(password || '');
  if (!identifier || !password) throw new Error('Enter your username, mobile number or email, and password.');
  const resolved = resolveLoginAccount_(identifier);
  if (resolved.role === MYTRIP.roles.administrator) {
    const administratorHash = getGlobalAdminHash();
    if (administratorHash && administratorHash === hashGlobalAdministrator(password)) return accountLoginResponse_(resolved);
    if (!administratorHash && accountUsernameMatches(identifier, getGlobalAdminUsername())) {
      const legacyMatch = objectsFromSheet('Trips').some(function(trip) {
        return (trip.adminHash && trip.adminHash === hashPin(trip.tripId, password, MYTRIP.roles.administrator)) ||
          (trip.accessHash && trip.accessHash === hashLegacyPin(trip.tripId, password));
      });
      if (legacyMatch) { adoptLegacyAdministrator(getGlobalAdminUsername(), password); return accountLoginResponse_(resolved); }
    }
    throw new Error('Incorrect login details.');
  }
  if (!isTravellerActive(resolved.account) || resolved.account.pinHash !== hashTravellerAccountPin(resolved.username, password)) throw new Error('Incorrect login details.');
  return accountLoginResponse_(resolved);
}

function accountLoginResponse_(resolved) {
  if (resolved.role === MYTRIP.roles.administrator) {
    return {
      accessRole: MYTRIP.roles.administrator,
      account: administratorSafeAccount_(),
      sessionSecret: createAccountSession_(MYTRIP.roles.administrator, getGlobalAdminUsername(), getGlobalAdminHash()),
      trips: listTripSummaries()
    };
  }
  let traveller = enforceRatingPlanForTraveller_(resolved.username);
  return {
    accessRole: MYTRIP.roles.traveller,
    account: { username: traveller.travellerId, role: MYTRIP.roles.traveller },
    traveller: safeTravellerAccount(traveller),
    sessionSecret: createAccountSession_(MYTRIP.roles.traveller, traveller.travellerId, traveller.pinHash),
    trips: listTravellerTripSummaries(traveller.travellerId)
  };
}

function resolveLoginAccount_(identifier) {
  const raw = cleanText(identifier, 120);
  if (!raw) throw new Error('Enter your username, mobile number or email.');
  const emailKey = loginEmailKey_(raw);
  const phoneKeys = loginPhoneKeys_(raw);
  const lower = raw.toLowerCase();
  const matches = [];
  const properties = PropertiesService.getScriptProperties();
  const adminUsername = getGlobalAdminUsername();
  const adminEmail = properties.getProperty(MYTRIP.globalAdminEmailProperty) || '';
  const adminPhone = properties.getProperty(MYTRIP.globalAdminPhoneProperty) || '';
  /* Username is globally unique. Returning here avoids opening and reading the
     TravellerAccounts sheet for the most common Administrator login path. */
  if (accountUsernameMatches(raw, adminUsername)) {
    return { role: MYTRIP.roles.administrator, username: adminUsername, account: administratorSafeAccount_() };
  }
  if ((emailKey && emailKey === loginEmailKey_(adminEmail)) || phoneKeysOverlap_(phoneKeys, loginPhoneKeys_(adminPhone))) {
    matches.push({ role: MYTRIP.roles.administrator, username: adminUsername, account: administratorSafeAccount_() });
  }
  objectsFromSheet('TravellerAccounts').forEach(function(account) {
    const id = String(account.travellerId || '').trim().toUpperCase();
    if (lower === id.toLowerCase() || (emailKey && emailKey === loginEmailKey_(account.email)) || phoneKeysOverlap_(phoneKeys, loginPhoneKeys_(account.phone))) {
      matches.push({ role: MYTRIP.roles.traveller, username: id, account: account });
    }
  });
  if (!matches.length) throw new Error('Incorrect login details.');
  if (matches.length > 1) throw new Error('This mobile number or email is linked to more than one account. Ask the Administrator to make it unique.');
  return matches[0];
}

function createAccountSession_(role, username, credentialHash) {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const record = { role: role, username: username, credentialHash: credentialHash, createdAt: Date.now() };
  CacheService.getScriptCache().put(accountSessionCacheKey_(token), JSON.stringify(record), 21600);
  return 'session:' + token;
}

function accountSessionCacheKey_(token) {
  return 'mytrip_auth_' + digestHex(String(token || '') + '|MYTRIP_ACCOUNT_SESSION_V1');
}

function verifyAccountSession_(secret, role, username, credentialHash) {
  secret = String(secret || '');
  if (secret.indexOf('session:') !== 0) return false;
  const token = secret.slice(8);
  if (!/^[a-f0-9]{64}$/i.test(token)) return false;
  const cache = CacheService.getScriptCache();
  const key = accountSessionCacheKey_(token);
  const raw = cache.get(key);
  if (!raw) return false;
  let record;
  try { record = JSON.parse(raw); } catch (error) { return false; }
  const sameUsername = role === MYTRIP.roles.administrator ? accountUsernameMatches(record.username, username) : String(record.username || '').toUpperCase() === String(username || '').toUpperCase();
  if (record.role !== role || !sameUsername || record.credentialHash !== credentialHash) { cache.remove(key); return false; }
  cache.put(key, JSON.stringify(record), 21600);
  return true;
}

function requestLoginOtp(identifier, requestedChannel) {
  const resolved = resolveLoginAccount_(identifier);
  if (resolved.role === MYTRIP.roles.traveller && !isTravellerActive(resolved.account)) throw new Error('This traveller account is inactive.');
  const account = resolved.role === MYTRIP.roles.administrator ? administratorSafeAccount_() : safeTravellerAccount(resolved.account);
  if (!account.otpEnabled) throw new Error('OTP login is not enabled for this account. Ask the Administrator to enable it.');
  const channel = chooseOtpChannel_(identifier, requestedChannel, account);
  const destination = account.email;
  const accountKey = resolved.role + '|' + resolved.username;
  const cache = CacheService.getScriptCache();
  const recentKey = 'mytrip_otp_recent_' + digestHex(accountKey);
  if (cache.get(recentKey)) throw new Error('Please wait one minute before requesting another OTP.');
  const hourKey = 'mytrip_otp_hour_' + digestHex(accountKey);
  const hourlyCount = Number(cache.get(hourKey) || 0);
  if (hourlyCount >= 5) throw new Error('Too many OTP requests. Try again after one hour.');

  const challengeId = Utilities.getUuid().replace(/-/g, '');
  const otp = generateLoginOtp_();
  const challenge = {
    purpose: 'login',
    role: resolved.role,
    username: resolved.username,
    channel: channel,
    destinationKey: loginEmailKey_(destination),
    otpHash: digestHex(challengeId + '|' + otp + '|' + accountKey + '|MYTRIP_OTP_V1'),
    attemptsLeft: 5,
    expiresAt: Date.now() + 10 * 60 * 1000
  };
  const challengeKey = 'mytrip_otp_' + digestHex(challengeId);
  cache.put(challengeKey, JSON.stringify(challenge), 600);
  cache.put(recentKey, '1', 60);
  cache.put(hourKey, String(hourlyCount + 1), 3600);
  try {
    sendLoginOtpEmail_(destination, otp, account.name || (resolved.role === MYTRIP.roles.administrator ? 'Administrator' : resolved.username));
  } catch (error) {
    cache.remove(challengeKey);
    cache.remove(recentKey);
    throw new Error('The OTP could not be sent. ' + (error && error.message ? error.message : String(error)));
  }
  return { challengeId: challengeId, channel: channel, maskedDestination: maskLoginEmail_(destination), expiresMinutes: 10 };
}

function generateLoginOtp_() {
  const entropy = digestHex(Utilities.getUuid() + '|' + Utilities.getUuid() + '|' + new Date().toISOString());
  return String(parseInt(entropy.slice(0, 12), 16) % 1000000).padStart(6, '0');
}

function authenticateAccountOtp(identifier, challengeId, otp) {
  const resolved = resolveLoginAccount_(identifier);
  challengeId = cleanText(challengeId, 80);
  otp = String(otp || '').trim();
  if (!challengeId || !/^\d{6}$/.test(otp)) throw new Error('Enter the 6-digit OTP.');
  const cache = CacheService.getScriptCache();
  const key = 'mytrip_otp_' + digestHex(challengeId);
  const raw = cache.get(key);
  if (!raw) throw new Error('This OTP has expired. Request a new OTP.');
  let challenge;
  try { challenge = JSON.parse(raw); } catch (error) { cache.remove(key); throw new Error('This OTP is invalid. Request a new OTP.'); }
  const sameUsername = resolved.role === MYTRIP.roles.administrator ? accountUsernameMatches(challenge.username, resolved.username) : String(challenge.username || '').toUpperCase() === resolved.username;
  if (challenge.purpose !== 'login' || challenge.role !== resolved.role || !sameUsername || Date.now() > Number(challenge.expiresAt || 0)) { cache.remove(key); throw new Error('This OTP has expired. Request a new OTP.'); }
  const expected = digestHex(challengeId + '|' + otp + '|' + resolved.role + '|' + resolved.username + '|MYTRIP_OTP_V1');
  if (expected !== challenge.otpHash) {
    challenge.attemptsLeft = Number(challenge.attemptsLeft || 1) - 1;
    if (challenge.attemptsLeft <= 0) cache.remove(key); else cache.put(key, JSON.stringify(challenge), Math.max(1, Math.ceil((challenge.expiresAt - Date.now()) / 1000)));
    throw new Error(challenge.attemptsLeft > 0 ? 'Incorrect OTP. ' + challenge.attemptsLeft + ' attempts remain.' : 'Too many incorrect attempts. Request a new OTP.');
  }
  cache.remove(key);
  markLoginContactVerified_(resolved, challenge.channel, challenge.destinationKey);
  return accountLoginResponse_(resolved);
}

/* Password recovery is deliberately separate from login OTP. Only a contact
 * that the account owner previously verified by OTP may receive a reset code.
 * Resetting the credential invalidates every older server session because
 * sessions are bound to the current password hash. */
function passwordResetOtpChannel_(identifier, requestedChannel, account) {
  const requested = String(requestedChannel || 'auto').trim().toLowerCase();
  if (requested !== 'auto' && requested !== 'email') throw new Error('MyTrip sends verification codes by email only.');
  const enteredEmail = loginEmailKey_(identifier);
  const savedEmail = loginEmailKey_(account.email);
  if (!savedEmail || !account.emailVerified) throw new Error('A verified email address is required for password recovery. Ask the Administrator to add an email, then verify it by signing in with an email OTP.');
  if (enteredEmail && enteredEmail !== savedEmail) throw new Error('This email does not match the verified account email.');
  return 'email';
}

function requestPasswordResetOtp(identifier, requestedChannel) {
  const resolved = resolveLoginAccount_(identifier);
  if (resolved.role === MYTRIP.roles.traveller && !isTravellerActive(resolved.account)) throw new Error('This traveller account is inactive.');
  const account = resolved.role === MYTRIP.roles.administrator ? administratorSafeAccount_() : safeTravellerAccount(resolved.account);
  if (!account.otpEnabled) throw new Error('OTP recovery is disabled for this account. Ask the Administrator to enable it.');
  const channel = passwordResetOtpChannel_(identifier, requestedChannel, account);
  const destination = account.email;
  const accountKey = resolved.role + '|' + resolved.username;
  const cache = CacheService.getScriptCache();
  const recentKey = 'mytrip_pwreset_recent_' + digestHex(accountKey);
  if (cache.get(recentKey)) throw new Error('Please wait one minute before requesting another password-reset OTP.');
  const hourKey = 'mytrip_pwreset_hour_' + digestHex(accountKey);
  const hourlyCount = Number(cache.get(hourKey) || 0);
  if (hourlyCount >= 5) throw new Error('Too many password-reset requests. Try again after one hour.');
  const challengeId = Utilities.getUuid().replace(/-/g, '');
  const otp = generateLoginOtp_();
  const challenge = {
    purpose: 'password-reset', role: resolved.role, username: resolved.username, channel: channel,
    destinationKey: loginEmailKey_(destination),
    otpHash: digestHex(challengeId + '|' + otp + '|' + accountKey + '|MYTRIP_PASSWORD_RESET_V1'),
    attemptsLeft: 5, expiresAt: Date.now() + 10 * 60 * 1000
  };
  const challengeKey = 'mytrip_pwreset_' + digestHex(challengeId);
  cache.put(challengeKey, JSON.stringify(challenge), 600);
  cache.put(recentKey, '1', 60);
  cache.put(hourKey, String(hourlyCount + 1), 3600);
  try {
    sendPasswordResetOtpEmail_(destination, otp, account.name || (resolved.role === MYTRIP.roles.administrator ? 'Administrator' : resolved.username));
  } catch (error) {
    cache.remove(challengeKey); cache.remove(recentKey);
    throw new Error('The password-reset OTP could not be sent. ' + (error && error.message ? error.message : String(error)));
  }
  return { challengeId: challengeId, channel: channel, maskedDestination: maskLoginEmail_(destination), expiresMinutes: 10 };
}

function resetPasswordWithOtp(identifier, challengeId, otp, newPassword) {
  const resolved = resolveLoginAccount_(identifier);
  challengeId = cleanText(challengeId, 80);
  otp = String(otp || '').trim();
  if (!challengeId || !/^\d{6}$/.test(otp)) throw new Error('Enter the 6-digit OTP.');
  const cache = CacheService.getScriptCache();
  const key = 'mytrip_pwreset_' + digestHex(challengeId);
  const raw = cache.get(key);
  if (!raw) throw new Error('This password-reset OTP has expired. Request a new one.');
  let challenge;
  try { challenge = JSON.parse(raw); } catch (error) { cache.remove(key); throw new Error('This password-reset OTP is invalid. Request a new one.'); }
  const sameUsername = resolved.role === MYTRIP.roles.administrator ? accountUsernameMatches(challenge.username, resolved.username) : String(challenge.username || '').toUpperCase() === resolved.username;
  if (challenge.purpose !== 'password-reset' || challenge.role !== resolved.role || !sameUsername || Date.now() > Number(challenge.expiresAt || 0)) { cache.remove(key); throw new Error('This password-reset OTP has expired. Request a new one.'); }
  const expected = digestHex(challengeId + '|' + otp + '|' + resolved.role + '|' + resolved.username + '|MYTRIP_PASSWORD_RESET_V1');
  if (expected !== challenge.otpHash) {
    challenge.attemptsLeft = Number(challenge.attemptsLeft || 1) - 1;
    if (challenge.attemptsLeft <= 0) cache.remove(key); else cache.put(key, JSON.stringify(challenge), Math.max(1, Math.ceil((challenge.expiresAt - Date.now()) / 1000)));
    throw new Error(challenge.attemptsLeft > 0 ? 'Incorrect OTP. ' + challenge.attemptsLeft + ' attempts remain.' : 'Too many incorrect attempts. Request a new password-reset OTP.');
  }
  if (resolved.role === MYTRIP.roles.administrator) {
    validateAdministratorSecret(newPassword);
    const nextHash = hashGlobalAdministrator(newPassword);
    if (nextHash === getGlobalAdminHash()) throw new Error('Choose a new password that is different from the current password.');
    PropertiesService.getScriptProperties().setProperty(MYTRIP.globalAdminHashProperty, nextHash);
  } else {
    const password = validateTravellerAccountPin(newPassword);
    const nextHash = hashTravellerAccountPin(resolved.username, password);
    if (nextHash === resolved.account.pinHash) throw new Error('Choose a new password that is different from the current password.');
    updateFieldsById_('TravellerAccounts', resolved.username, { pinHash: nextHash, updatedAt: new Date().toISOString() }, 'travellerId');
  }
  cache.remove(key);
  markLoginContactVerified_(resolved, challenge.channel, challenge.destinationKey);
  return accountLoginResponse_(resolved);
}

function markLoginContactVerified_(resolved, channel, destinationKey) {
  const verifiedAt = new Date().toISOString();
  if (resolved.role === MYTRIP.roles.administrator) {
    const properties = PropertiesService.getScriptProperties();
    if (channel === 'email' && loginEmailKey_(properties.getProperty(MYTRIP.globalAdminEmailProperty)) === destinationKey) properties.setProperty(MYTRIP.globalAdminEmailVerifiedProperty, verifiedAt);
    return;
  }
  const account = getTravellerAccount(resolved.username, false);
  if (channel === 'email' && loginEmailKey_(account.email) === destinationKey) updateCellById('TravellerAccounts', resolved.username, 'emailVerifiedAt', verifiedAt, 'travellerId');
}

function verifyTravellerAccount(travellerId, pin) {
  travellerId = normaliseTravellerId(travellerId);
  pin = String(pin || '');
  const account = getTravellerAccount(travellerId, false);
  if (!isTravellerActive(account)) throw new Error('This traveller account is inactive.');
  if (verifyAccountSession_(pin, MYTRIP.roles.traveller, travellerId, account.pinHash)) return account;
  if (account.pinHash !== hashTravellerAccountPin(travellerId, pin)) throw new Error('Incorrect username or password.');
  return account;
}

function getTravellerAccount(travellerId, allowMissing) {
  travellerId = normaliseTravellerId(travellerId);
  const account = objectsFromSheet('TravellerAccounts').filter(function(item) {
    return item.travellerId === travellerId;
  })[0];
  if (!account && !allowMissing) throw new Error('Traveller account not found.');
  return account || null;
}

function safeTravellerAccount(account, createdTripCount) {
  const quota = travellerTripCreationStatus(account, createdTripCount);
  return {
    travellerId: account.travellerId,
    name: account.name,
    phone: account.phone || '',
    email: account.email || '',
    otpEnabled: booleanSetting(account.otpEnabled),
    emailVerified: Boolean(account.email && account.emailVerifiedAt),
    emailVerifiedAt: account.emailVerifiedAt || '',
    city: account.city || '',
    emergencyContact: account.emergencyContact || '',
    notes: account.notes || '',
    photoUrl: account.photoUrl || '',
    active: isTravellerActive(account),
    canCreateTrips: quota.enabled,
    canCreateAnotherTrip: quota.canCreateAnotherTrip,
    tripCreationLimit: quota.tripCreationLimit,
    createdTripCount: quota.createdTripCount,
    tripCreationRemaining: quota.tripCreationRemaining,
    plan: travellerPlanOf(account),
    planSaved: String(account.plan || 'free').toLowerCase() === 'pro' ? 'pro' : 'free',
    planExpires: account.planExpires ? String(account.planExpires).slice(0, 10) : '',
    planSource: planSourceOf_(account),
    ratingDowngradedTripId: account.ratingDowngradedTripId || '',
    createdAt: account.createdAt || '',
    updatedAt: account.updatedAt || ''
  };
}

function isTravellerActive(account) {
  return String(account && account.active).toUpperCase() !== 'FALSE';
}

function travellerCanCreateTrips(account) {
  return travellerTripCreationLimit(account) > 0;
}

function travellerTripCreationLimit(account) {
  const rawLimit = account && account.tripCreationLimit;
  if (String(rawLimit == null ? '' : rawLimit).trim() === '') return booleanSetting(account && account.canCreateTrips) ? 1 : 0;
  return normaliseTripCreationLimit(rawLimit);
}

function normaliseTripCreationLimit(value) {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 0 || limit > 100) throw new Error('Trip-creation limit must be a whole number from 0 to 100. Use 0 to disable creation.');
  return limit;
}

function travellerCreatedTripCounts() {
  const activeTripIds = {};
  objectsFromSheet('Trips').forEach(function(trip) { activeTripIds[trip.tripId] = true; });
  const seen = {};
  const counts = {};
  function add(travellerId, tripId) {
    travellerId = String(travellerId || '').trim().toUpperCase();
    tripId = String(tripId || '').trim().toUpperCase();
    if (!travellerId || !activeTripIds[tripId]) return;
    const key = travellerId + '|' + tripId;
    if (seen[key]) return;
    seen[key] = true;
    counts[travellerId] = (counts[travellerId] || 0) + 1;
  }
  objectsFromSheet('Trips').forEach(function(trip) { add(trip.createdByTravellerId, trip.tripId); });
  objectsFromSheet('TripAssignments').forEach(function(assignment) {
    if (String(assignment.role || '').trim().toLowerCase() === 'organiser') add(assignment.travellerId, assignment.tripId);
  });
  return counts;
}

function travellerTripCreationStatus(account, createdTripCount) {
  const limit = travellerTripCreationLimit(account);
  if (typeof createdTripCount === 'undefined') createdTripCount = travellerCreatedTripCounts()[String(account && account.travellerId || '').trim().toUpperCase()] || 0;
  createdTripCount = Math.max(0, Number(createdTripCount) || 0);
  const remaining = Math.max(0, limit - createdTripCount);
  return {
    enabled: limit > 0,
    canCreateAnotherTrip: limit > 0 && remaining > 0,
    tripCreationLimit: limit,
    createdTripCount: createdTripCount,
    tripCreationRemaining: remaining
  };
}

function validBooleanSetting(value) {
  return value === true || value === false || ['TRUE', 'FALSE', 'ON', 'OFF', '1', '0', 'YES', 'NO', ''].indexOf(String(value == null ? '' : value).trim().toUpperCase()) >= 0;
}

function booleanSetting(value) {
  return value === true || ['TRUE', 'ON', '1', 'YES'].indexOf(String(value == null ? '' : value).trim().toUpperCase()) >= 0;
}

function validateSharedTripPassword(password) {
  password = String(password || '');
  if (password.length < 4 || password.length > 64 || /[\u0000-\u001F\u007F]/.test(password)) throw new Error('Shared trip password must contain 4 to 64 characters.');
  return password;
}

function validateTravellerAccountPin(pin) {
  pin = String(pin || '');
  if (pin.length < 4 || pin.length > 64 || /[\u0000-\u001F\u007F]/.test(pin)) throw new Error('Traveller password must contain 4 to 64 characters.');
  return pin;
}

function hashTravellerAccountPin(travellerId, pin) {
  return digestHex(normaliseTravellerId(travellerId) + '|' + String(pin || '') + '|MYTRIP_TRAVELLER_ACCOUNT_V4');
}

function validateAccessSecrets(adminPin, travellerPin) {
  validateAdministratorSecret(adminPin);
  travellerPin = String(travellerPin || '');
  if (travellerPin.length < 4 || travellerPin.length > 64 || /[\u0000-\u001F\u007F]/.test(travellerPin)) throw new Error('Shared trip password must contain 4 to 64 characters.');
  if (adminPin === travellerPin) throw new Error('The Administrator password and shared trip password must be different.');
}

function validateAdministratorSecret(secret) {
  secret = String(secret || '');
  if (secret.length < 6 || secret.length > 64 || /[\u0000-\u001F\u007F]/.test(secret)) throw new Error('Administrator password must contain 6 to 64 characters.');
}

function validateLoginEmail_(value, allowEmpty) {
  const email = cleanText(value, 120).toLowerCase();
  if (!email && allowEmpty) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  return email;
}

function validateLoginPhone_(value, allowEmpty) {
  const phone = cleanText(value, 30);
  if (!phone && allowEmpty) return '';
  if (!/^[+()\d.\s-]+$/.test(phone)) throw new Error('Enter a valid mobile number.');
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) throw new Error('Mobile number must contain 8 to 15 digits.');
  return phone;
}

function loginEmailKey_(value) {
  const raw = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? raw : '';
}

function loginPhoneKeys_(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.indexOf('00') === 0) digits = digits.slice(2);
  if (digits.length < 8 || digits.length > 15) return [];
  const keys = [digits];
  if (digits.length > 10) keys.push(digits.slice(-10));
  return keys.filter(function(item, index, all) { return all.indexOf(item) === index; });
}

function phoneKeysOverlap_(left, right) {
  return left.length > 0 && right.length > 0 && left.some(function(key) { return right.indexOf(key) >= 0; });
}

function ensureLoginContactsAvailable_(role, username, email, phone) {
  const emailKey = loginEmailKey_(email);
  const phoneKeys = loginPhoneKeys_(phone);
  const properties = PropertiesService.getScriptProperties();
  if (role !== MYTRIP.roles.administrator) {
    if (emailKey && emailKey === loginEmailKey_(properties.getProperty(MYTRIP.globalAdminEmailProperty))) throw new Error('That email is already used by the Administrator account.');
    if (phoneKeysOverlap_(phoneKeys, loginPhoneKeys_(properties.getProperty(MYTRIP.globalAdminPhoneProperty)))) throw new Error('That mobile number is already used by the Administrator account.');
  }
  objectsFromSheet('TravellerAccounts').forEach(function(account) {
    if (role === MYTRIP.roles.traveller && String(account.travellerId || '').toUpperCase() === String(username || '').toUpperCase()) return;
    if (emailKey && emailKey === loginEmailKey_(account.email)) throw new Error('That email is already used by another account.');
    if (phoneKeysOverlap_(phoneKeys, loginPhoneKeys_(account.phone))) throw new Error('That mobile number is already used by another account.');
  });
  return true;
}

function administratorSafeAccount_() {
  const properties = PropertiesService.getScriptProperties();
  return {
    username: getGlobalAdminUsername(),
    name: 'Administrator',
    role: MYTRIP.roles.administrator,
    email: properties.getProperty(MYTRIP.globalAdminEmailProperty) || '',
    phone: properties.getProperty(MYTRIP.globalAdminPhoneProperty) || '',
    otpEnabled: properties.getProperty(MYTRIP.globalAdminOtpEnabledProperty) === 'TRUE',
    emailVerified: Boolean(properties.getProperty(MYTRIP.globalAdminEmailProperty) && properties.getProperty(MYTRIP.globalAdminEmailVerifiedProperty)),
    emailVerifiedAt: properties.getProperty(MYTRIP.globalAdminEmailVerifiedProperty) || '',
    emailOnlyOtp: true
  };
}

function chooseOtpChannel_(identifier, requestedChannel, account) {
  const requested = String(requestedChannel || 'auto').trim().toLowerCase();
  if (requested !== 'auto' && requested !== 'email') throw new Error('MyTrip sends verification codes by email only.');
  const hasEmail = Boolean(loginEmailKey_(account.email));
  if (!hasEmail) throw new Error('No email address is saved for this account. Ask the Administrator to add one before enabling OTP login.');
  return 'email';
}

function sendLoginOtpEmail_(email, otp, name) {
  MailApp.sendEmail({
    to: email,
    subject: 'Your MyTrip login OTP',
    name: 'MyTrip',
    body: 'Hello ' + name + ',\n\nYour MyTrip login OTP is ' + otp + '.\n\nIt expires in 10 minutes and can be used only once. Do not share it with anyone.\n\nIf you did not request this code, you can ignore this message.'
  });
}

function sendPasswordResetOtpEmail_(email, otp, name) {
  MailApp.sendEmail({
    to: email,
    subject: 'Reset your MyTrip password',
    name: 'MyTrip',
    body: 'Hello ' + name + ',\n\nYour MyTrip password-reset OTP is ' + otp + '.\n\nIt expires in 10 minutes and can be used only once. Do not share it with anyone.\n\nIf you did not request a password reset, ignore this message and your password will remain unchanged.'
  });
}

function maskLoginEmail_(email) {
  const parts = String(email || '').split('@');
  if (parts.length !== 2) return 'registered email';
  const local = parts[0];
  return (local.slice(0, Math.min(2, local.length)) || '*') + '***@' + parts[1];
}

function getGlobalAdminHash() {
  return PropertiesService.getScriptProperties().getProperty(MYTRIP.globalAdminHashProperty) || '';
}

function getGlobalAdminUsername() {
  return normaliseAccountUsername(PropertiesService.getScriptProperties().getProperty(MYTRIP.globalAdminUsernameProperty) || 'administrator');
}

function normaliseAccountUsername(value) {
  const username = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) throw new Error('Username must contain 3 to 40 letters, numbers, dots, underscores or hyphens.');
  return username;
}

function accountUsernameMatches(left, right) {
  try { return normaliseAccountUsername(left) === normaliseAccountUsername(right); }
  catch (error) { return false; }
}

function ensureAdministratorUsernameAvailable(username) {
  username = normaliseAccountUsername(username);
  const usernamePhoneKeys = loginPhoneKeys_(username);
  const conflict = objectsFromSheet('TravellerAccounts').some(function(item) {
    return String(item.travellerId || '').trim().toLowerCase() === username || phoneKeysOverlap_(usernamePhoneKeys, loginPhoneKeys_(item.phone));
  });
  if (conflict) throw new Error('That username is already used by a Traveller account or matches a saved mobile number.');
  return username;
}

function hashGlobalAdministrator(secret) {
  return digestHex(String(secret || '') + '|MYTRIP_GLOBAL_ADMIN_V3');
}

function ensureGlobalAdministrator(username, secret) {
  username = ensureAdministratorUsernameAvailable(username || 'administrator');
  validateAdministratorSecret(secret);
  const properties = PropertiesService.getScriptProperties();
  const expectedHash = hashGlobalAdministrator(secret);
  const storedHash = properties.getProperty(MYTRIP.globalAdminHashProperty) || '';
  if (storedHash && storedHash !== expectedHash) throw new Error('Incorrect username or password.');
  const storedUsername = properties.getProperty(MYTRIP.globalAdminUsernameProperty) || '';
  if (storedHash && storedUsername && !accountUsernameMatches(username, storedUsername)) throw new Error('Incorrect Administrator username.');
  if (!storedUsername) properties.setProperty(MYTRIP.globalAdminUsernameProperty, username);
  if (!storedHash) properties.setProperty(MYTRIP.globalAdminHashProperty, expectedHash);
}

function verifyGlobalAdministrator(username, secret) {
  username = String(username || '');
  secret = String(secret || '');
  if (!username || !secret) throw new Error('Enter the Administrator username and password.');
  const storedHash = getGlobalAdminHash();
  if (!storedHash) throw new Error('Global Administrator access is not configured. Open one existing trip with its old Administrator PIN first, or create the first trip.');
  /* Secure session tokens are 72 characters ("session:" + 64 hex). The old
     64-character password guard rejected every valid signed-in session, so
     Change login and other Administrator controls failed after login. */
  if (accountUsernameMatches(username, getGlobalAdminUsername()) && verifyAccountSession_(secret, MYTRIP.roles.administrator, getGlobalAdminUsername(), storedHash)) return getGlobalAdminUsername();
  if (secret.length < 4 || secret.length > 64) throw new Error('Incorrect username or password.');
  if (!accountUsernameMatches(username, getGlobalAdminUsername()) || storedHash !== hashGlobalAdministrator(secret)) throw new Error('Incorrect username or password.');
  return getGlobalAdminUsername();
}

function adoptLegacyAdministrator(username, secret) {
  username = normaliseAccountUsername(username || 'administrator');
  secret = String(secret || '');
  if (secret.length < 4 || secret.length > 64) throw new Error('The old Administrator PIN is invalid.');
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty(MYTRIP.globalAdminUsernameProperty)) properties.setProperty(MYTRIP.globalAdminUsernameProperty, username);
  if (!properties.getProperty(MYTRIP.globalAdminHashProperty)) properties.setProperty(MYTRIP.globalAdminHashProperty, hashGlobalAdministrator(secret));
}

function hashPin(tripId, pin, role) {
  return digestHex(tripId + '|' + pin + '|' + role + '|MYTRIP_V2');
}

function hashLegacyPin(tripId, pin) {
  return digestHex(tripId + '|' + pin + '|MYTRIP_V1');
}

function digestHex(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
  return bytes.map(function(byte) { const unsigned = byte < 0 ? byte + 256 : byte; return ('0' + unsigned.toString(16)).slice(-2); }).join('');
}

function getTripRow(tripId) {
  const trip = objectsFromSheet('Trips').filter(function(item) { return item.tripId === tripId; })[0];
  if (!trip) throw new Error('Trip not found. Check the trip code.');
  return trip;
}

function uniqueTripId(destination) {
  const prefix = cleanText(destination, 3).replace(/[^A-Za-z]/g, '').toUpperCase().padEnd(3, 'X').substring(0, 3);
  const existing = objectsFromSheet('Trips').map(function(item) { return item.tripId; });
  for (let attempt = 0; attempt < 20; attempt++) {
    const id = prefix + Math.floor(100 + Math.random() * 900);
    if (existing.indexOf(id) < 0) return id;
  }
  return 'MT' + Utilities.getUuid().replace(/-/g, '').substring(0, 6).toUpperCase();
}

function uniqueTravellerId(name) {
  const base = cleanText(name, 8).replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'TRAVELLER';
  const existing = objectsFromSheet('TravellerAccounts').map(function(item) { return item.travellerId; });
  for (let attempt = 0; attempt < 50; attempt++) {
    const id = base + '-' + Math.floor(100 + Math.random() * 900);
    if (existing.indexOf(id) < 0) return id;
  }
  return 'TRV-' + Utilities.getUuid().replace(/-/g, '').substring(0, 8).toUpperCase();
}

function ensureHeaders(sheet, requiredHeaders) {
  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    return;
  }
  const existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const missing = requiredHeaders.filter(function(header) { return existing.indexOf(header) < 0; });
  if (missing.length) sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
}

function recordsForTrip(sheetName, tripId) {
  return objectsFromSheet(sheetName).filter(function(item) { return item.tripId === tripId; });
}

/* v4.25.0: a retried request (slow network, Google 5xx, offline queue) must never write the same row twice. */
const IDEMPOTENT_SHEETS_ = { Expenses: 1, QuickExpensePasses: 1, Itinerary: 1, ExperienceNotes: 1, Places: 1, Members: 1, Checklist: 1, StickyNotes: 1, TripPhotos: 1, Settlements: 1 };
function appendObject(sheetName, object) {
  const sheet = getSpreadsheet().getSheetByName(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  if (IDEMPOTENT_SHEETS_[sheetName] && object && object.id) {
    const col = headers.indexOf('id');
    if (col >= 0 && sheet.getLastRow() > 1) {
      const found = sheet.getRange(2, col + 1, sheet.getLastRow() - 1, 1).createTextFinder(String(object.id)).matchEntireCell(true).findNext();
      if (found) return false;
    }
  }
  sheet.appendRow(headers.map(function(header) { return typeof object[header] === 'undefined' ? '' : object[header]; }));
  invalidateObjectRows_(sheetName);
}

/**
 * Reads a sheet into plain objects.
 *
 * Text comes from getValues() — the STORED cell content. getDisplayValues()
 * returns the cell as RENDERED, which clips multi-line text, and that silently
 * dropped lines from saved sticky notes on the next read. Dates, numbers and
 * booleans still come from getDisplayValues(), which is what the rest of the
 * app expects (formatted 'yyyy-MM-dd' strings rather than Date objects).
 */
const MYTRIP_OBJECT_ROWS_CACHE_ = {};
function invalidateObjectRows_(sheetName) { delete MYTRIP_OBJECT_ROWS_CACHE_[sheetName]; }
function objectsFromSheet(sheetName) {
  if (Object.prototype.hasOwnProperty.call(MYTRIP_OBJECT_ROWS_CACHE_, sheetName)) {
    return MYTRIP_OBJECT_ROWS_CACHE_[sheetName].map(function(item) { return Object.assign({}, item); });
  }
  const sheet = getSpreadsheet().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const range = sheet.getDataRange();
  const raw = range.getValues();
  const shown = range.getDisplayValues();
  const headers = raw[0].map(String);
  const records = [];
  for (let rowIndex = 1; rowIndex < raw.length; rowIndex++) {
    const rawRow = raw[rowIndex];
    const shownRow = shown[rowIndex];
    if (!rawRow.some(function(cell) { return String(cell) !== ''; })) continue;
    const object = {};
    headers.forEach(function(header, index) {
      const rawCell = rawRow[index];
      object[header] = typeof rawCell === 'string' ? rawCell : shownRow[index];
    });
    records.push(object);
  }
  MYTRIP_OBJECT_ROWS_CACHE_[sheetName] = records;
  return records.map(function(item) { return Object.assign({}, item); });
}

function assertRecordBelongsToTrip(sheetName, id, tripId) {
  const match = objectsFromSheet(sheetName).some(function(item) { return item.id === String(id) && item.tripId === tripId; });
  if (!match) throw new Error('The record was not found in this trip.');
}

/**
 * Writes a whole record in ONE sheet read and ONE sheet write.
 * Used by the sticky board: field-by-field updates needed a full sheet read per
 * field, which made saving slow enough to hit the request timeout.
 */
function writeRowById(sheetName, id, object, idField) {
  const sheet = getSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet ' + sheetName + ' is missing. Run setupMyTrip().');
  const key = idField || 'id';
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  const values = sheet.getRange(1, 1, Math.max(lastRow, 1), lastColumn).getValues();
  const headers = values[0].map(String);
  const keyColumn = headers.indexOf(key);
  if (keyColumn < 0) throw new Error('Column ' + key + ' is missing from ' + sheetName + '. Run setupMyTrip().');
  let rowIndex = -1;
  for (let index = 1; index < values.length; index++) {
    if (String(values[index][keyColumn]) === String(id)) { rowIndex = index; break; }
  }
  const row = rowIndex >= 0 ? values[rowIndex].slice() : headers.map(function() { return ''; });
  headers.forEach(function(header, column) {
    if (Object.prototype.hasOwnProperty.call(object, header)) row[column] = object[header];
  });
  if (rowIndex >= 0) sheet.getRange(rowIndex + 1, 1, 1, lastColumn).setValues([row]);
  else sheet.appendRow(row);
  invalidateObjectRows_(sheetName);
  return { sheet: sheetName, id: id, created: rowIndex < 0 };
}

/** Updates several fields using one sheet read and one row write. This keeps
 * account and security changes fast as the historical spreadsheet grows. */
function updateFieldsById_(sheetName, id, changes, idField) {
  const sheet = getSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet ' + sheetName + ' is missing. Run setupMyTrip().');
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  const values = sheet.getRange(1, 1, Math.max(lastRow, 1), lastColumn).getValues();
  const headers = values[0].map(String);
  const keyColumn = headers.indexOf(idField || 'id');
  if (keyColumn < 0) throw new Error('Data key is missing from ' + sheetName + '. Run setupMyTrip().');
  const unknown = Object.keys(changes || {}).filter(function(field) { return headers.indexOf(field) < 0; });
  if (unknown.length) throw new Error('Data column is missing: ' + unknown[0] + '. Run setupMyTrip() once.');
  for (let row = 1; row < values.length; row++) {
    if (String(values[row][keyColumn]) !== String(id)) continue;
    const next = values[row].slice();
    Object.keys(changes || {}).forEach(function(field) { next[headers.indexOf(field)] = changes[field]; });
    sheet.getRange(row + 1, 1, 1, lastColumn).setValues([next]);
    invalidateObjectRows_(sheetName);
    return { sheet: sheetName, id: id, updatedFields: Object.keys(changes || {}).length };
  }
  throw new Error('Record not found.');
}

/** Keeps the same traveller name in every assigned trip using one column read
 * and one batched column write. No work is performed when the profile name did
 * not change, which keeps ordinary email/contact saves fast. */
function updateMemberNamesByTraveller_(travellerId, newName) {
  const sheet = getSpreadsheet().getSheetByName('Members');
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const travellerColumn = headers.indexOf('travellerId');
  const nameColumn = headers.indexOf('name');
  if (travellerColumn < 0 || nameColumn < 0) return 0;
  const rowCount = sheet.getLastRow() - 1;
  const ids = sheet.getRange(2, travellerColumn + 1, rowCount, 1).getDisplayValues();
  const names = sheet.getRange(2, nameColumn + 1, rowCount, 1).getValues();
  let changed = 0;
  for (let row = 0; row < rowCount; row++) {
    if (String(ids[row][0]).trim().toUpperCase() !== travellerId) continue;
    if (String(names[row][0]) === String(newName)) continue;
    names[row][0] = newName;
    changed += 1;
  }
  if (changed) {
    sheet.getRange(2, nameColumn + 1, rowCount, 1).setValues(names);
    invalidateObjectRows_('Members');
  }
  return changed;
}

function updateCellById(sheetName, id, field, value, idField) {
  const sheet = getSpreadsheet().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const idColumn = headers.indexOf(idField || 'id');
  const fieldColumn = headers.indexOf(field);
  if (idColumn < 0 || fieldColumn < 0) throw new Error('Data column is missing: ' + field + '. Run setupMyTrip() once.');
  for (let row = 1; row < values.length; row++) {
    if (String(values[row][idColumn]) === String(id)) {
      sheet.getRange(row + 1, fieldColumn + 1).setValue(value);
      invalidateObjectRows_(sheetName);
      return;
    }
  }
  throw new Error('Record not found.');
}

function replaceFieldValue(sheetName, field, oldValue, newValue) {
  const sheet = getSpreadsheet().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const fieldColumn = headers.indexOf(field);
  if (fieldColumn < 0) throw new Error('Data column is missing: ' + field + '. Run setupMyTrip() once.');
  let changed = 0;
  const columnValues = values.slice(1).map(function(row) { return [row[fieldColumn]]; });
  columnValues.forEach(function(row) {
    if (String(row[0]).trim().toUpperCase() === String(oldValue).trim().toUpperCase()) { row[0] = newValue; changed += 1; }
  });
  if (changed) {
    sheet.getRange(2, fieldColumn + 1, columnValues.length, 1).setValues(columnValues);
    invalidateObjectRows_(sheetName);
  }
  return changed;
}

function afterMutation(tripId, action, details, createdBy) {
  updateCellById('Trips', tripId, 'updatedAt', new Date().toISOString(), 'tripId');
  logActivity(tripId, action, details, createdBy);
}

/* ---- v4.23.0: change history + nightly backup ---- */
const ACTIVITY_SKIP_ = { listActivity: 1, listBackups: 1, listJoinRequests: 1, backupNow: 1 };
function autoLogActivity_(tripId, action, body, who) {
  if (ACTIVITY_SKIP_[action]) return;
  const r = body.record || body.trip || {};
  const name = cleanText(r.label || r.title || r.text || r.name || r.place || '', 80);
  const amt = Number(r.amount) > 0 ? ' · ₹' + Number(r.amount) : '';
  const verb = /^add|^upload|^create|^approve/.test(action) ? 'Added' : /^delete|^remove|^reject|^disable|^archive/.test(action) ? 'Deleted' : 'Changed';
  const where = body.sheet ? String(body.sheet) : action.replace(/^(add|update|delete|upload|remove|set|create|disable|approve|reject|archive)/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
  const details = (verb + ' ' + where + (name ? ' — ' + name : '') + amt + (body.id && !name ? ' (#' + String(body.id).slice(-6) + ')' : '')).slice(0, 300);
  logActivity(tripId, action, details, who);
}

function listActivity(tripId, limit) {
  const n = Math.min(Math.max(Number(limit) || 150, 1), 500);
  return objectsFromSheet('Activity').filter(function(a) { return a.tripId === tripId; })
    .sort(function(a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); }).slice(0, n);
}

/* ---- v4.31.5: Administrator Access & Audit register ----
 * Records account identity and coarse device context only. Passwords, OTPs,
 * bearer-link tokens, IP addresses and GPS location are never stored.
 */
function accessClient_(input) {
  const client = input && typeof input === 'object' ? input : {};
  return {
    deviceType: cleanText(client.deviceType, 24), browser: cleanText(client.browser, 40),
    operatingSystem: cleanText(client.operatingSystem, 50), timezone: cleanText(client.timezone, 60),
    language: cleanText(client.language, 20), screen: cleanText(client.screen, 24),
    sessionId: cleanText(client.sessionId, 80)
  };
}

function accessMaskIdentifier_(value) {
  const text = cleanText(value, 120);
  if (!text) return 'Unknown account';
  if (text.indexOf('@') > 0) {
    const parts = text.split('@');
    return parts[0].slice(0, 2) + '•••@' + parts.slice(1).join('@');
  }
  const digits = text.replace(/\D/g, '');
  if (digits.length >= 8) return '••••••' + digits.slice(-4);
  return text.slice(0, 3) + (text.length > 3 ? '•••' : '');
}

function logAccessEvent_(record) {
  record = record || {};
  const client = accessClient_(record.client);
  ensureSheet_('AccessLog');
  const row = {
    id: createId('ACL'), tripId: cleanText(record.tripId, 20),
    accountId: cleanText(record.accountId, 80), accountName: cleanText(record.accountName, 80),
    role: cleanText(record.role, 24), event: cleanText(record.event, 40),
    method: cleanText(record.method, 24), success: record.success === false ? 'FALSE' : 'TRUE',
    details: cleanText(record.details, 300), deviceType: client.deviceType,
    browser: client.browser, operatingSystem: client.operatingSystem, timezone: client.timezone,
    language: client.language, screen: client.screen, sessionId: client.sessionId,
    linkPassId: cleanText(record.linkPassId, 80), createdAt: new Date().toISOString()
  };
  appendObject('AccessLog', row);
  return row;
}

function logFailedLogin_(identifier, method, client, error) {
  try {
    const hint = accessMaskIdentifier_(identifier);
    const key = 'access_fail_' + digestHex(hint + '|' + method + '|' + String((client || {}).sessionId || '')).slice(0, 36);
    const cache = CacheService.getScriptCache();
    if (cache.get(key)) return;
    cache.put(key, '1', 300);
    logAccessEvent_({ accountId: hint, accountName: 'Unverified attempt', role: 'unknown', event: 'SIGN_IN_FAILED', method: method, success: false, details: cleanText(error && error.message, 120) || 'Incorrect login details', client: client });
  } catch (ignored) {}
}

function authenticateAccountWithAudit_(identifier, password, client) {
  try {
    const result = authenticateAccount(identifier, password);
    const traveller = result.traveller || {};
    logAccessEvent_({ accountId: result.account.username, accountName: result.accessRole === MYTRIP.roles.administrator ? 'Administrator' : (traveller.name || result.account.username), role: result.accessRole, event: 'SIGN_IN_SUCCESS', method: 'password', success: true, details: 'Account sign-in', client: client });
    return result;
  } catch (error) { logFailedLogin_(identifier, 'password', client, error); throw error; }
}

function authenticateAccountOtpWithAudit_(identifier, challengeId, otp, client) {
  try {
    const result = authenticateAccountOtp(identifier, challengeId, otp);
    const traveller = result.traveller || {};
    logAccessEvent_({ accountId: result.account.username, accountName: result.accessRole === MYTRIP.roles.administrator ? 'Administrator' : (traveller.name || result.account.username), role: result.accessRole, event: 'SIGN_IN_SUCCESS', method: 'email OTP', success: true, details: 'Email OTP sign-in', client: client });
    return result;
  } catch (error) { logFailedLogin_(identifier, 'email OTP', client, error); throw error; }
}

function logTripOpen_(tripId, accessRole, travellerId, username, client) {
  try {
    const cleanClient = accessClient_(client);
    const identity = accessRole === MYTRIP.roles.administrator ? getGlobalAdminUsername() : travellerId;
    const key = 'access_open_' + digestHex((cleanClient.sessionId || identity || 'shared') + '|' + tripId).slice(0, 36);
    const cache = CacheService.getScriptCache();
    if (cache.get(key)) return;
    cache.put(key, '1', 300);
    let accountId = identity || 'SHARED-TRIP', accountName = 'Shared trip access', role = identity ? accessRole : 'shared';
    if (accessRole === MYTRIP.roles.administrator) accountName = 'Administrator';
    else if (travellerId) {
      const account = getTravellerAccount(travellerId, false);
      accountName = account.name || travellerId;
    }
    logAccessEvent_({ tripId: tripId, accountId: accountId, accountName: accountName, role: role, event: 'TRIP_OPENED', method: identity ? 'account session' : 'shared trip password', success: true, details: 'Opened trip dashboard', client: client });
  } catch (ignored) {}
}

function recordAuthenticatedAccessEvent_(body) {
  const username = cleanText(body.username || body.travellerId, 120);
  const secret = String(body.password || body.pin || '');
  const event = ['SIGN_OUT', 'IDLE_TIMEOUT'].indexOf(cleanText(body.event, 40)) >= 0 ? cleanText(body.event, 40) : 'SESSION_ACTIVITY';
  let accountId = '', accountName = '', role = '';
  try {
    accountId = verifyGlobalAdministrator(username, secret); accountName = 'Administrator'; role = MYTRIP.roles.administrator;
  } catch (adminError) {
    const account = verifyTravellerAccount(username, secret);
    accountId = account.travellerId; accountName = account.name || account.travellerId; role = MYTRIP.roles.traveller;
  }
  return logAccessEvent_({ tripId: cleanText(body.tripId, 20), accountId: accountId, accountName: accountName, role: role, event: event, method: 'account session', success: true, details: cleanText(body.details, 200), client: body.client });
}

function listAccessAudit(options) {
  options = options || {};
  ensureSheet_('AccessLog');
  const limit = Math.min(Math.max(Number(options.limit) || 500, 25), 500);
  const accessRows = objectsFromSheet('AccessLog').map(function(row) {
    return Object.assign({ source: 'access' }, row, { success: String(row.success).toUpperCase() !== 'FALSE' });
  });
  const activityRows = objectsFromSheet('Activity').map(function(row) {
    return { id: row.id, tripId: row.tripId, accountId: '', accountName: row.createdBy || 'Trip member', role: '', event: 'DATA_CHANGE', method: 'signed-in dashboard', success: true, details: row.details || row.action, deviceType: '', browser: '', operatingSystem: '', timezone: '', language: '', screen: '', sessionId: '', linkPassId: '', createdAt: row.createdAt, source: 'activity' };
  });
  const rows = accessRows.concat(activityRows).sort(function(a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); }).slice(0, limit);
  const trips = objectsFromSheet('Trips').map(function(trip) { return { tripId: trip.tripId, name: trip.name || trip.destination || trip.tripId }; });
  return { rows: rows, trips: trips, idleMinutes: getIdleMinutes(), identityNote: 'Shared-link names are self-declared and are not login-verified.' };
}

function myTripBackupFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('BACKUP_FOLDER_ID');
  let folder = null;
  if (id) { try { folder = DriveApp.getFolderById(id); if (folder.isTrashed()) folder = null; } catch (error) {} }
  if (!folder) {
    const root = myTripRootFolder_();
    const existing = root.getFoldersByName('Backups');
    folder = existing.hasNext() ? existing.next() : root.createFolder('Backups');
    props.setProperty('BACKUP_FOLDER_ID', folder.getId());
  }
  try { folder.moveTo(myTripRootFolder_()); folder.setName('Backups'); } catch (error) { console.warn('Backup folder could not be moved: ' + error.message); }
  return folder;
}

/** Copies the live spreadsheet into MyTrip Dashboard/Backups. Keeps the latest 14. Runs nightly once installed. */
function backupMyTrip() {
  const ss = getSpreadsheet();
  const folder = myTripBackupFolder_();
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Kolkata', 'yyyy-MM-dd HH:mm');
  const copy = DriveApp.getFileById(ss.getId()).makeCopy('MyTrip backup ' + stamp, folder);
  const files = []; const it = folder.getFiles(); while (it.hasNext()) files.push(it.next());
  files.sort(function(a, b) { return b.getDateCreated() - a.getDateCreated(); });
  files.slice(14).forEach(function(f) { try { f.setTrashed(true); } catch (error) {} });
  return { name: copy.getName(), url: copy.getUrl(), kept: Math.min(files.length, 14), rootFolderUrl: myTripRootFolder_().getUrl() };
}

function listBackups_() {
  const folder = myTripBackupFolder_();
  const files = []; const it = folder.getFiles(); while (it.hasNext()) { const f = it.next(); files.push({ name: f.getName(), url: f.getUrl(), createdAt: f.getDateCreated().toISOString() }); }
  files.sort(function(a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  const nightly = ScriptApp.getProjectTriggers().some(function(t) { return t.getHandlerFunction() === 'backupMyTrip'; });
  return { nightly: nightly, folderUrl: folder.getUrl(), rootFolderUrl: myTripRootFolder_().getUrl(), backups: files.slice(0, 14) };
}

/** Installs a daily 2–3 AM backup. Safe to run again (no duplicates). Run All calls this. */
function installNightlyBackup() {
  const exists = ScriptApp.getProjectTriggers().some(function(t) { return t.getHandlerFunction() === 'backupMyTrip'; });
  if (!exists) ScriptApp.newTrigger('backupMyTrip').timeBased().everyDays(1).atHour(2).create();
  return { installed: true, alreadyExisted: exists };
}

/** Removes rows that share the same id (left by retried saves before v4.25.0). Keeps the first copy. Safe to run any time; Run All calls it. */
function removeDuplicateRows() {
  const out = {};
  Object.keys(IDEMPOTENT_SHEETS_).forEach(function(name) {
    const sheet = getSpreadsheet().getSheetByName(name); if (!sheet || sheet.getLastRow() < 3) return;
    const values = sheet.getDataRange().getValues(); const col = values[0].map(String).indexOf('id'); if (col < 0) return;
    const seen = {}; const drop = [];
    for (let r = 1; r < values.length; r++) { const id = String(values[r][col] || ''); if (!id) continue; if (seen[id]) drop.push(r + 1); else seen[id] = true; }
    for (let k = drop.length - 1; k >= 0; k--) sheet.deleteRow(drop[k]);
    if (drop.length) out[name] = drop.length;
  });
  return { removed: out };
}

function logActivity(tripId, action, details, createdBy) {
  appendObject('Activity', { id: createId('ACT'), tripId: tripId, action: action, details: details, createdBy: createdBy || '', createdAt: new Date().toISOString() });
}

function createId(prefix) { return prefix + '-' + Utilities.getUuid().replace(/-/g, '').substring(0, 12).toUpperCase(); }

let MYTRIP_SPREADSHEET_CACHE_ = null;
function getSpreadsheet() {
  if (MYTRIP_SPREADSHEET_CACHE_) return MYTRIP_SPREADSHEET_CACHE_;
  const id = PropertiesService.getScriptProperties().getProperty(MYTRIP.spreadsheetProperty);
  if (!id) throw new Error('Backend setup is incomplete. Run setupMyTrip() once in Apps Script.');
  MYTRIP_SPREADSHEET_CACHE_ = SpreadsheetApp.openById(id);
  return MYTRIP_SPREADSHEET_CACHE_;
}

function withLock(callback) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('The trip is busy. Please try again in a moment.');
  try { return callback(); } finally { lock.releaseLock(); }
}

function parseBody(e) {
  if (!e || !e.postData || !e.postData.contents) throw new Error('The request body is empty.');
  try { return JSON.parse(e.postData.contents); } catch (error) { throw new Error('The request is not valid JSON.'); }
}

function cleanText(value, maximumLength) { return String(value == null ? '' : value).replace(/[\u2028\u2029]+/g, ' ').trim().replace(/[\u0000-\u001F\u007F]/g, '').substring(0, maximumLength || 500); }
/**
 * Like cleanText but KEEPS line breaks. cleanText strips \u0000-\u001F, which
 * includes \n, so multi-line sticky details were being flattened to one line.
 */
/**
 * Sticky note details only. Multi-line text is STORED with U+2028 LINE
 * SEPARATOR between lines, never a
 * real newline: a literal \n inside a Google Sheets cell is lossy on some
 * round-trips (long values get truncated at a line break), which silently cut
 * saved sticky notes down to the first few lines. U+2028 is an ordinary
 * character to Sheets, so every line survives unchanged. The dashboard decodes
 * it back to \n when the note is shown, and legacy rows holding real newlines
 * are normalised here on their next save.
 */
function cleanMultilineText(value, maximumLength) {
  const normalised = String(value == null ? '' : value)
    .replace(/\r\n?/g, '\n')
    .replace(/\u2028|\u2029/g, '\n')
    .replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\n+$/, '')
    .substring(0, maximumLength || 500);
  return normalised.split('\n').join('\u2028');
}

function requiredText(value, label, maximumLength) { const text = cleanText(value, maximumLength); if (!text) throw new Error(label + ' is required.'); return text; }
function validDate(value, label) { const text = cleanText(value, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || isNaN(new Date(text + 'T12:00:00').getTime())) throw new Error(label + ' is invalid.'); return text; }
function positiveNumber(value, label, allowZero) { const number = Number(value); if (!isFinite(number) || (allowZero ? number < 0 : number <= 0)) throw new Error(label + ' must be ' + (allowZero ? 'zero or more.' : 'greater than zero.')); return Math.round(number * 100) / 100; }
function normalisePhotoUrl(value) {
  let url = cleanText(value, 1000);
  if (url && !/^https:\/\//i.test(url)) throw new Error('Trip photo link must start with https://');
  /* A pasted Google Drive "share" link (file/d/<id>/view) doesn't render as an
     <img>; rewrite it to Drive's direct-view form so the thumbnail works.
     The file must still be shared as "Anyone with the link can view". */
  if (url && /drive\.google\.com/i.test(url)) {
    const m = url.match(/\/file\/d\/([^/]+)/) || url.match(/[?&]id=([^&]+)/);
    if (m && m[1]) url = 'https://drive.google.com/uc?export=view&id=' + m[1];
  }
  return url;
}
function normaliseTripId(value) { const id = cleanText(value, 20).replace(/[^A-Za-z0-9-]/g, '').toUpperCase(); if (!id) throw new Error('Trip code is required.'); return id; }
function normaliseTravellerId(value) { const id = cleanText(value, 30).replace(/[^A-Za-z0-9-]/g, '').toUpperCase(); if (!id) throw new Error('Traveller ID is required.'); return id; }
/**
 * Every successful response carries the Administrator's auto sign-out
 * setting, so each open dashboard picks up a change on its next request —
 * no separate polling and no reliance on a cached ping.
 */
function jsonResponse(payload) {
  if (payload && payload.ok === true) {
    try { payload.idleMinutes = getIdleMinutes(); } catch (error) {}
    if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data) && typeof payload.data.backendVersion === 'undefined') payload.data.backendVersion = MYTRIP.version;
  }
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

/** Auto sign-out after inactivity, in minutes. Shared by every login. */
function getIdleMinutes() {
  const stored = Number(PropertiesService.getScriptProperties().getProperty(MYTRIP.idleMinutesProperty));
  return MYTRIP.idleMinuteChoices.indexOf(stored) >= 0 ? stored : 5;
}

function setIdleMinutes(minutes) {
  const value = Number(minutes);
  if (MYTRIP.idleMinuteChoices.indexOf(value) < 0) throw new Error('Auto sign-out must be 5, 30, 60 or 120 minutes.');
  PropertiesService.getScriptProperties().setProperty(MYTRIP.idleMinutesProperty, String(value));
  return { idleMinutes: value };
}


/* ============================================================
 * Setup, maintenance and diagnostic functions
 * Run these directly from the Apps Script editor.
 * Start with runAll() — it performs every setup step in order.
 * ============================================================ */



/** Spreadsheet menu: MyTrip > Run setup / Check status / Generate admin login. */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('MyTrip')
      .addItem('Run all setup steps', 'runAll')
      .addItem('Run setup only (safe)', 'setupMyTrip')
      .addItem('Check backend status', 'myTripStatus')
      .addItem('Repair sheets and headers', 'repairMyTripSpreadsheet')
      .addSeparator()
      .addItem('Generate Administrator login', 'generateMyTripAdministratorLogin')
      .addToUi();
  } catch (error) {
    console.log('Menu not created (script is not bound to a spreadsheet): ' + error.message);
  }
}

/** Every action name accepted by doPost(). */
function listMyTripActions() {
  const actions = [
    'ping', 'login', 'requestLoginOtp', 'loginWithOtp', 'requestPasswordResetOtp', 'resetPasswordWithOtp', 'getTrip', 'getTripSection', 'getExpenseReceipt', 'quickGetExpenseReceipt', 'getSystemHealth', 'repairSystemHealth', 'runSystemBackup', 'setSystemNightlyBackup', 'getQuickExpenseInfo', 'quickAddExpense', 'quickUpdateExpense', 'quickDeleteExpense', 'quickUploadExpenseReceipt', 'listAccessAudit', 'recordAccessEvent',
    'listTrips', 'listMyTrips', 'createTrip', 'createTravellerTrip', 'updateTrip', 'deleteTrip', 'setTripEnabled',
    'setTripListHidden', 'setTripListOrder', 'setIdleTimeout', 'uploadProfilePhoto', 'getProfilePhotos',
    'listTravellerAccounts', 'createTravellerAccount', 'updateTravellerAccount', 'deleteTravellerAccount',
    'resetTravellerPin', 'changeMyPassword', 'listActivity', 'listBackups', 'backupNow', 'removeDuplicateRows', 'getInviteInfo', 'joinTripByInvite', 'resplitExpenses', 'createTripInvite', 'disableTripInvite', 'listJoinRequests', 'approveJoinRequest', 'rejectJoinRequest', 'uploadExpenseReceipt', 'removeExpenseReceipt', 'addChecklistItem', 'updateChecklistItem', 'deleteChecklistItem', 'listTripOwnerTravellers', 'tripOwnerResetPin', 'updateTravellerCredentials', 'setTravellerActive', 'listQuickExpensePasses', 'createQuickExpensePass', 'setQuickExpensePassEnabled', 'updateQuickExpensePassSettings',
    'setTravellerTripCreationAccess', 'setTravellerTripCreationLimit', 'setTravellerPlan', 'setProEnforced', 'getPlanSettings',
    'assignTraveller', 'assignTravellers', 'assignTravellerToTrips', 'removeTravellerAssignment',
    'setTravellerExpenseAccess', 'setTravellerFeatureAccess', 'setTravellerPhotoLimit',
    'changeAdministratorLogin', 'changePins',
    'addPlan', 'addExpense', 'addPlace', 'addExperience', 'addMember', 'archiveStickyNote',
    'saveStickyNote', 'deleteStickyNote', 'setTravellerStickyAccess',
    'saveFeedback', 'getFeedback',
    'updateRecord', 'deleteRecord',
    'uploadTripPhoto', 'removeTripPhoto', 'setTripPhotoUploadEnabled',
    'uploadTripMemoryPhoto', 'replaceTripMemoryPhoto', 'deleteTripMemoryPhoto'
  ];
  console.log('MyTrip v' + MYTRIP.version + ' supports ' + actions.length + ' actions:');
  actions.forEach(function(action) { console.log(' • ' + action); });
  return actions;
}

/**
 * Health check. Prints spreadsheet link, credential state, sheet row counts and
 * any missing columns. Run this first whenever the dashboard reports a problem.
 */
function myTripStatus() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty(MYTRIP.spreadsheetProperty) || '';
  const report = {
    version: MYTRIP.version,
    spreadsheetConfigured: Boolean(spreadsheetId),
    spreadsheetId: spreadsheetId,
    spreadsheetUrl: '',
    administratorUsername: '',
    administratorPasswordConfigured: Boolean(getGlobalAdminHash()),
    sheets: {},
    missingColumns: {},
    trips: 0,
    travellerAccounts: 0
  };
  try { report.administratorUsername = getGlobalAdminUsername(); } catch (error) { report.administratorUsername = '(invalid)'; }

  if (!spreadsheetId) {
    console.log('Backend setup is incomplete. Run setupMyTrip() once.');
    return report;
  }
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  report.spreadsheetUrl = spreadsheet.getUrl();
  Object.keys(MYTRIP.sheets).forEach(function(name) {
    const sheet = spreadsheet.getSheetByName(name);
    if (!sheet) { report.sheets[name] = 'MISSING'; report.missingColumns[name] = MYTRIP.sheets[name]; return; }
    report.sheets[name] = Math.max(0, sheet.getLastRow() - 1) + ' rows';
    const headers = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String) : [];
    const missing = MYTRIP.sheets[name].filter(function(header) { return headers.indexOf(header) < 0; });
    if (missing.length) report.missingColumns[name] = missing;
  });
  report.trips = objectsFromSheet('Trips').length;
  report.travellerAccounts = objectsFromSheet('TravellerAccounts').length;

  console.log('MyTrip backend v' + report.version);
  console.log('Spreadsheet: ' + report.spreadsheetUrl);
  console.log('Administrator username: ' + report.administratorUsername + (report.administratorPasswordConfigured ? ' (password set)' : ' (NO PASSWORD SET — run generateMyTripAdministratorLogin())'));
  console.log('Trips: ' + report.trips + ' · Traveller accounts: ' + report.travellerAccounts);
  Object.keys(report.sheets).forEach(function(name) { console.log(' • ' + name + ': ' + report.sheets[name]); });
  if (Object.keys(report.missingColumns).length) console.log('Missing columns found — run repairMyTripSpreadsheet().');
  else console.log('All required sheets and columns are present.');
  return report;
}

/** Compact, password-protected health payload for the Administrator dashboard. */
function myTripSystemHealth_() {
  const started = new Date();
  const spreadsheet = getSpreadsheet();
  const sheets = [];
  let missingColumns = 0;
  Object.keys(MYTRIP.sheets).forEach(function(name) {
    const sheet = spreadsheet.getSheetByName(name);
    if (!sheet) {
      missingColumns += MYTRIP.sheets[name].length;
      sheets.push({ name: name, status: 'missing', rows: 0, missing: MYTRIP.sheets[name] });
      return;
    }
    const headers = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String) : [];
    const missing = MYTRIP.sheets[name].filter(function(header) { return headers.indexOf(header) < 0; });
    missingColumns += missing.length;
    sheets.push({ name: name, status: missing.length ? 'attention' : 'ready', rows: Math.max(0, sheet.getLastRow() - 1), missing: missing });
  });
  let backup = { nightly: false, backups: [], folderUrl: '', rootFolderUrl: '' };
  try { backup = listBackups_(); } catch (error) { backup.error = error.message; }
  const trips = objectsFromSheet('Trips');
  const travellers = objectsFromSheet('TravellerAccounts');
  const quickLinks = objectsFromSheet('QuickExpensePasses');
  const activity = objectsFromSheet('AccessLog').concat(objectsFromSheet('Activity')).sort(function(a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  return {
    status: missingColumns ? 'attention' : 'ready',
    version: MYTRIP.version,
    checkedAt: started.toISOString(),
    responseMs: new Date().getTime() - started.getTime(),
    spreadsheetName: spreadsheet.getName(),
    spreadsheetUrl: spreadsheet.getUrl(),
    rootFolderUrl: backup.rootFolderUrl || '',
    sheets: sheets,
    missingColumns: missingColumns,
    trips: trips.length,
    activeTrips: trips.filter(function(trip) { return String(trip.enabled).toUpperCase() !== 'FALSE'; }).length,
    travellers: travellers.length,
    activeTravellers: travellers.filter(isTravellerActive).length,
    activeQuickLinks: quickLinks.filter(function(pass) { return quickExpenseEnabled_(pass.enabled); }).length,
    photos: objectsFromSheet('TripPhotos').length,
    expenses: objectsFromSheet('Expenses').length,
    lastActivityAt: activity.length ? activity[0].createdAt || '' : '',
    backup: { nightly: backup.nightly === true, count: (backup.backups || []).length, lastAt: backup.backups && backup.backups.length ? backup.backups[0].createdAt : '', folderUrl: backup.folderUrl || '', error: backup.error || '' }
  };
}

/**
 * Non-destructive repair: recreates any missing sheet, appends any missing
 * column, restores header formatting and re-runs data migrations. No rows are
 * deleted and no credential is changed.
 */
function repairMyTripSpreadsheet() {
  const result = setupMyTrip();
  const status = myTripStatus();
  result.missingColumns = status.missingColumns;
  result.repaired = Object.keys(status.missingColumns).length === 0;
  console.log(result.repaired ? 'Repair finished. The spreadsheet structure is correct.' : 'Some columns are still missing. Check the log above.');
  return result;
}

/**
 * Point this project at an existing MyTrip spreadsheet (for example after
 * copying the file or moving to a new Google account). Paste the spreadsheet ID
 * or its full URL.
 */
function setMyTripSpreadsheetId(spreadsheetIdOrUrl) {
  const raw = String(spreadsheetIdOrUrl || '').trim();
  if (!raw) throw new Error('Pass the spreadsheet ID or URL, for example setMyTripSpreadsheetId("1AbC...").');
  const match = raw.match(/[-\w]{25,}/);
  if (!match) throw new Error('That does not look like a Google Sheets ID or URL.');
  const spreadsheet = SpreadsheetApp.openById(match[0]);
  PropertiesService.getScriptProperties().setProperty(MYTRIP.spreadsheetProperty, spreadsheet.getId());
  console.log('MyTrip is now linked to: ' + spreadsheet.getUrl());
  return setupMyTrip();
}

/** Prints the spreadsheet link for the currently linked data file. */
function openMyTripSpreadsheet() {
  const url = getSpreadsheet().getUrl();
  console.log('MyTrip data spreadsheet: ' + url);
  return url;
}

/**
 * End-to-end self test. Confirms setup, runs the ping payload the dashboard
 * checks on connect, and reports whether the Administrator login is usable.
 */
function testMyTripBackend() {
  const ping = JSON.parse(doGet().getContent());
  const status = myTripStatus();
  const ready = Boolean(status.spreadsheetConfigured) &&
    Object.keys(status.missingColumns).length === 0 &&
    status.administratorPasswordConfigured;
  const report = {
    ready: ready,
    ping: ping.data,
    actions: listMyTripActions().length,
    spreadsheetUrl: status.spreadsheetUrl,
    administratorUsername: status.administratorUsername
  };
  console.log(ready
    ? 'SELF TEST PASSED. Deploy > Manage deployments > New version, then paste the /exec URL into config.js.'
    : 'SELF TEST INCOMPLETE. Fix the items listed above and run testMyTripBackend() again.');
  return report;
}

/**
 * Deletes every MyTrip Script Property (spreadsheet link and Administrator
 * credentials). The spreadsheet itself and all trip data are untouched.
 * Pass the exact text RESET to confirm.
 */
function resetMyTripScriptProperties(confirmation) {
  if (String(confirmation || '').trim().toUpperCase() !== 'RESET') {
    throw new Error('Call resetMyTripScriptProperties("RESET") to confirm. Trip data is never deleted by this function.');
  }
  const properties = PropertiesService.getScriptProperties();
  [MYTRIP.spreadsheetProperty, MYTRIP.globalAdminHashProperty, MYTRIP.globalAdminUsernameProperty, MYTRIP.globalAdminEmailProperty, MYTRIP.globalAdminPhoneProperty, MYTRIP.globalAdminOtpEnabledProperty, MYTRIP.globalAdminEmailVerifiedProperty,
    MYTRIP.rootFolderProperty, 'MYTRIP_PHOTO_ROOT', 'BACKUP_FOLDER_ID', MYTRIP.temporaryAdminResetProperty, MYTRIP.temporaryAdminUsernameResetProperty, MYTRIP.stickyAccessMigrationProperty, MYTRIP.idleMinutesProperty].forEach(function(key) {
    properties.deleteProperty(key);
  });
  console.log('All MyTrip script properties were cleared. Run setupMyTrip() or setMyTripSpreadsheetId() next.');
  return { cleared: true };
}


/* ---------- Help & Feedback (v4.15.0) ---------- */
function feedbackSheet() {
  const spreadsheet = getSpreadsheet();
  let sheet = spreadsheet.getSheetByName('Feedback');
  if (!sheet) {
    sheet = spreadsheet.insertSheet('Feedback');
    ensureHeaders(sheet, MYTRIP.sheets.Feedback);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, sheet.getLastColumn()).setBackground('#17263c').setFontColor('#ffffff').setFontWeight('bold');
  } else {
    ensureHeaders(sheet, MYTRIP.sheets.Feedback);
  }
  return sheet;
}

/** One reply per person per trip; sending again updates it. */
function saveFeedback(tripId, accessRole, travellerId, username, input) {
  const record = input || {};
  const name = cleanText(record.name, 60);
  const role = accessRole === MYTRIP.roles.administrator ? 'administrator' : 'traveller';
  const userKey = travellerId ? 'traveller:' + travellerId : (role === 'administrator' ? 'admin:' + cleanText(username, 40).toLowerCase() : 'trip:' + name.toLowerCase());
  const star = function(value) { const n = Math.round(Number(value)); return n >= 1 && n <= 5 ? n : ''; };
  const now = new Date().toISOString();
  const sheet = feedbackSheet();
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const col = function(h) { return headers.indexOf(h); };
  let rowIndex = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][col('tripId')]) === String(tripId) && String(values[i][col('userKey')]) === userKey) { rowIndex = i; break; }
  }
  const row = {
    id: rowIndex > 0 ? values[rowIndex][col('id')] : Utilities.getUuid(),
    tripId: tripId, userKey: userKey, name: name, role: role,
    overall: star(record.overall), itinerary: star(record.itinerary), expenses: star(record.expenses), sticky: star(record.sticky), photos: star(record.photos),
    suggestion: cleanText(record.suggestion, 600),
    createdAt: rowIndex > 0 ? values[rowIndex][col('createdAt')] : now, updatedAt: now
  };
  const out = headers.map(function(h) { return typeof row[h] === 'undefined' ? '' : row[h]; });
  if (rowIndex > 0) sheet.getRange(rowIndex + 1, 1, 1, out.length).setValues([out]);
  else sheet.appendRow(out);
  let account = null;
  if (travellerId) account = enforceRatingPlanForTraveller_(travellerId);
  return {
    saved: true,
    updatedAt: now,
    plan: account ? travellerPlanOf(account) : (accessRole === MYTRIP.roles.administrator ? 'pro' : 'free'),
    planSource: account ? planSourceOf_(account) : (accessRole === MYTRIP.roles.administrator ? 'protected' : 'free'),
    ratingStatus: ratingStatusForTrip_(getTripRow(tripId), travellerId, account)
  };
}

function feedbackSummary() {
  const rows = objectsFromSheet('Feedback');
  const features = ['overall', 'itinerary', 'expenses', 'sticky', 'photos'];
  const averages = {};
  features.forEach(function(f) {
    const nums = rows.map(function(r) { return Number(r[f]); }).filter(function(n) { return n >= 1 && n <= 5; });
    averages[f] = { count: nums.length, average: nums.length ? nums.reduce(function(a, b) { return a + b; }, 0) / nums.length : 0 };
  });
  const suggestions = rows.filter(function(r) { return String(r.suggestion || '').trim(); })
    .sort(function(a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); })
    .slice(0, 30)
    .map(function(r) { return { name: r.name, tripId: r.tripId, suggestion: r.suggestion, updatedAt: String(r.updatedAt) }; });
  return { total: rows.length, averages: averages, suggestions: suggestions };
}

/** One Drive home for the live spreadsheet, Photos and Backups. Existing file
 * IDs remain unchanged, so deployed links and spreadsheet data keep working. */
function myTripRootFolder_() {
  const props = PropertiesService.getScriptProperties();
  let root = null;
  const id = props.getProperty(MYTRIP.rootFolderProperty);
  if (id) { try { root = DriveApp.getFolderById(id); if (root.isTrashed()) root = null; } catch (error) {} }
  if (!root) {
    const found = DriveApp.getFoldersByName('MyTrip Dashboard');
    root = found.hasNext() ? found.next() : DriveApp.createFolder('MyTrip Dashboard');
    props.setProperty(MYTRIP.rootFolderProperty, root.getId());
  }
  return root;
}

function myTripPhotoRootFolder_() {
  const props = PropertiesService.getScriptProperties();
  let folder = null;
  const id = props.getProperty('MYTRIP_PHOTO_ROOT');
  if (id) { try { folder = DriveApp.getFolderById(id); if (folder.isTrashed()) folder = null; } catch (error) {} }
  if (!folder) {
    const root = myTripRootFolder_();
    const inside = root.getFoldersByName('Photos');
    if (inside.hasNext()) folder = inside.next();
    else {
      const legacy = DriveApp.getFoldersByName('MyTrip Photos');
      folder = legacy.hasNext() ? legacy.next() : root.createFolder('Photos');
    }
    props.setProperty('MYTRIP_PHOTO_ROOT', folder.getId());
  }
  try { folder.moveTo(myTripRootFolder_()); folder.setName('Photos'); } catch (error) { console.warn('Photo folder could not be moved: ' + error.message); }
  return folder;
}

function organiseMyTripDrive_() {
  const root = myTripRootFolder_();
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty(MYTRIP.spreadsheetProperty);
  if (spreadsheetId) {
    try { DriveApp.getFileById(spreadsheetId).moveTo(root); } catch (error) { console.warn('Live spreadsheet could not be moved: ' + error.message); }
  }
  const photos = myTripPhotoRootFolder_();
  const backups = myTripBackupFolder_();
  return { rootFolderId: root.getId(), rootFolderUrl: root.getUrl(), photoFolderId: photos.getId(), backupFolderId: backups.getId(), spreadsheetId: spreadsheetId };
}

/** Returns (creating if needed) the Drive folder MyTrip Dashboard/Photos/<sub>/<trip>. */
function myTripPhotoFolder_(sub, tripId) {
  const root = myTripPhotoRootFolder_();
  const child = function(parent, name) { const it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); };
  let folder = child(root, sub);
  if (tripId) folder = child(folder, 'Trip ' + String(tripId).replace(/[^A-Za-z0-9 _-]/g, '-'));
  return folder;
}
function saveToPhotoFolder_(blob, sub, tripId) {
  try { return myTripPhotoFolder_(sub, tripId).createFile(blob); }
  catch (error) {
    console.warn('Photo subfolder unavailable, saving in the MyTrip parent folder: ' + error.message);
    try { return myTripRootFolder_().createFile(blob); } catch (rootError) { return DriveApp.createFile(blob); }
  }
}

/** Re-applies "Anyone with link can view" on every file in Photos. Run once if photos stop showing. */
function fixPhotoSharing() {
  const walk = function(folder) { let n = 0; const files = folder.getFiles(); while (files.hasNext()) { try { files.next().setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); n++; } catch (e) {} } const subs = folder.getFolders(); while (subs.hasNext()) n += walk(subs.next()); return n; };
  const n = walk(myTripPhotoRootFolder_());
  Logger.log('Sharing fixed on ' + n + ' photos.'); return n;
}

/** Moves any MyTrip photos already in My Drive root into the MyTrip Photos folders. Run once from the editor. */
function organiseExistingPhotos() {
  const files = DriveApp.getRootFolder().searchFiles("title contains 'MyTrip-' and mimeType contains 'image/'");
  let moved = 0;
  while (files.hasNext()) {
    const f = files.next(); const n = f.getName();
    let sub = 'Trip covers'; let m = n.match(/^MyTrip-([^-]+)-\d+/);
    if (/^MyTrip-Gallery-/.test(n)) { sub = 'Trip gallery'; m = n.match(/^MyTrip-Gallery-([^-]+)-/); }
    else if (/^MyTrip-profile-/.test(n)) { sub = 'Profile photos'; m = null; }
    try { f.moveTo(myTripPhotoFolder_(sub, m ? m[1] : '')); moved++; } catch (e) {}
  }
  Logger.log('Moved ' + moved + ' photos into "MyTrip Dashboard/Photos".');
  return moved;
}

/* Small card thumbnails (~25 KB each) kept in the spreadsheet so trip cards never depend on Drive links. */
function thumbSheet_() {
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty(MYTRIP.spreadsheetProperty));
  return ss.getSheetByName('PhotoThumbs') || (function() { const s = ss.insertSheet('PhotoThumbs'); s.getRange(1, 1, 1, 3).setValues([['tripId', 'thumb', 'updatedAt']]); s.hideSheet(); return s; })();
}
function saveTripThumb_(tripId, thumb) {
  thumb = String(thumb || '');
  if (!/^data:image\/(jpeg|webp);base64,/.test(thumb) || thumb.length > 48000) return;
  const sheet = thumbSheet_(); const values = sheet.getDataRange().getValues(); const key = String(tripId).toUpperCase();
  for (let r = 1; r < values.length; r++) if (String(values[r][0]).toUpperCase() === key) { sheet.getRange(r + 1, 2, 1, 2).setValues([[thumb, new Date()]]); CacheService.getScriptCache().remove('tripThumbs'); return; }
  sheet.appendRow([key, thumb, new Date()]); CacheService.getScriptCache().remove('tripThumbs');
}
function tripThumbMap_() {
  const map = {};
  try { thumbSheet_().getDataRange().getValues().slice(1).forEach(function(row) { if (row[0] && row[1]) map[String(row[0]).toUpperCase()] = String(row[1]); }); } catch (e) {}
  return map;
}
