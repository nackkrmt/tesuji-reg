// Thai dictionary — the source of truth for the string shape. `en.ts` must
// satisfy `Dictionary` (= typeof this), so any missing/renamed key is a
// compile error. Strings that interpolate are stored as functions.

export const th = {
  common: {
    loading: "กำลังโหลด…",
    save: "บันทึก",
    saving: "กำลังบันทึก…",
    cancel: "ยกเลิก",
    confirm: "ยืนยัน",
    close: "ปิด",
    back: "ย้อนกลับ",
    next: "ถัดไป",
    edit: "แก้ไข",
    delete: "ลบ",
    remove: "นำออก",
    retry: "ลองใหม่",
    loadErrorTitle: "โหลดข้อมูลไม่สำเร็จ",
    loadErrorDesc: "การเชื่อมต่ออาจขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง",
    saveFailed: "บันทึกไม่สำเร็จ การเชื่อมต่ออาจขัดข้อง กรุณาลองใหม่อีกครั้ง",
    submit: "ส่งข้อมูล",
    required: "จำเป็น",
    optional: "ไม่บังคับ",
    redirecting: "กำลังพาไปยังหน้าที่ต้องการ…",
    baht: "บาท",
    year: "ปี",
    people: "คน",
  },
  header: {
    home: "หน้าหลัก",
    back: "ย้อนกลับ",
    appName: "Tesuji",
    tagline: "ระบบรับสมัครแข่งขันหมากล้อม",
    language: "ภาษา",
    backToList: "รายการแข่งขันทั้งหมด",
  },
  errorPage: {
    notFoundTitle: "ไม่พบหน้านี้",
    notFoundDesc:
      "ลิงก์อาจหมดอายุ ถูกย้าย หรือพิมพ์ผิด ลองกลับไปหน้ารายการแข่งขัน",
    crashTitle: "เกิดข้อผิดพลาด",
    crashDesc:
      "ระบบทำงานผิดพลาดชั่วคราว ลองใหม่อีกครั้ง หรือกลับไปหน้ารายการแข่งขัน",
    goHome: "ไปหน้ารายการแข่งขัน",
  },
  nav: {
    schedule: "กำหนดการ",
    rules: "กฎ กติกา",
    participants: "รายชื่อ",
    home: "หน้าหลัก",
    register: "สมัคร",
    account: "บัญชี",
    live: "ผลการจับคู่",
    judgeConsole: "ระบบกรรมการ",
    results: "ผลการแข่งขัน",
    myRegs: "ใบสมัคร",
    overview: "ภาพรวม",
  },
  account: {
    signIn: "เข้าสู่ระบบ",
    menu: "เมนูบัญชี",
    myRegistrations: "สถานะการสมัคร",
    myProfile: "โปรไฟล์ของฉัน",
    managedPlayers: "ผู้เล่นในกำกับ",
    signOut: "ออกจากระบบ",
    title: "บัญชี",
    signInPrompt: "เข้าสู่ระบบเพื่อจัดการการสมัครและผู้เล่นของคุณ",
  },
  home: {
    noTournamentTitle: "ยังไม่มีการแข่งขันที่เปิดรับสมัคร",
    noTournamentDesc: "โปรดติดตามรายการแข่งขันเร็ว ๆ นี้",
    listEmptyTitle: "ยังไม่มีรายการแข่งขัน",
    listEmptyDesc: "โปรดติดตามรายการแข่งขันเร็ว ๆ นี้",
    sectionOpen: "เปิดรับสมัคร",
    sectionUpcoming: "กำลังจะมาถึง",
    sectionFinished: "ที่ผ่านมา",
    searchPlaceholder: "ค้นหารายการแข่งขัน…",
    filterAll: "ทั้งหมด",
    viewList: "มุมมองรายการ",
    viewCalendar: "มุมมองปฏิทิน",
    noMatch: "ไม่พบรายการแข่งขันที่ตรงกับตัวกรอง",
    calWeekdays: ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"],
    calPrevMonth: "เดือนก่อนหน้า",
    calNextMonth: "เดือนถัดไป",
    calToday: "วันนี้",
    calPickHint: "แตะวันที่มีจุดเพื่อดูรายการแข่งขันของวันนั้น",
    calMonthEmpty: "เดือนนี้ไม่มีรายการแข่งขัน",
    calMoreEvents: (n: number) => `และอีก ${n} รายการ`,
    clearFilters: "ล้างตัวกรอง",
    featuredLabel: "รายการเด่น",
    closesOn: (date: string) => `ปิดรับสมัคร ${date}`,
    competitionDate: "วันที่แข่งขัน",
    location: "สถานที่แข่งขัน",
    openInMaps: "เปิดใน Google Maps",
    regOpens: "เปิดรับสมัคร",
    regCloses: "ปิดรับสมัคร",
    categoriesTitle: "ประเภทการแข่งขันที่เปิดรับ",
    registerCta: "สมัครการแข่งขัน",
    allFull: "ที่นั่งเต็มทุกรุ่น",
    notYetOpen: "ยังไม่เปิดรับสมัคร",
    notYetOpenAt: (date: string) => `เปิดรับสมัคร ${date}`,
    closed: "ปิดรับสมัครแล้ว",
    pillOpen: "เปิดรับสมัคร",
    pillFull: "ที่นั่งเต็ม",
    pillSoon: "เร็ว ๆ นี้",
  },
  // Tournament detail page (/t/[tid]).
  tourn: {
    notFoundTitle: "ไม่พบรายการแข่งขัน",
    notFoundDesc: "ลิงก์อาจไม่ถูกต้อง หรือรายการถูกลบไปแล้ว",
    viewDetail: "ดูรายละเอียด",
    liveNotReady: "จะเปิดเมื่อการแข่งขันเริ่มขึ้น",
  },
  // ผลการแข่งขัน hub (/results).
  results: {
    title: "ผลการแข่งขัน",
    subtitle: "ผลการจับคู่และอันดับของแต่ละรายการแข่งขัน",
    liveNow: "กำลังแข่งขัน",
    openBoard: "ดูผลการจับคู่",
    emptyTitle: "ยังไม่มีผลการแข่งขัน",
    emptyDesc: "ผลจะแสดงที่นี่เมื่อการแข่งขันเริ่มขึ้น",
    judgeSection: "สำหรับกรรมการ",
    judgeNeedsBoard: "จะใช้งานได้เมื่อมีการจับคู่",
  },
  category: {
    full: "เต็ม",
    fullStatus: "เต็มแล้ว",
    almostFull: "ใกล้เต็ม",
    open: "เปิดรับ",
    comingSoon: "เร็ว ๆ นี้",
    seatsLeft: "ที่นั่งที่ยังว่าง",
    ofSeats: (total: number) => ` / ${total} ที่`,
    emptyList: "ยังไม่มีรุ่นที่เปิดรับสมัคร",
    colCode: "รหัส",
    colName: "ชื่อรุ่น",
    colLevel: "ระดับฝีมือ",
    colCapacity: "รับทั้งหมด",
    colRemaining: "ที่นั่งเหลือ",
    colFee: "ค่าสมัคร",
    age: "อายุ",
  },
  info: {
    noScheduleTitle: "ยังไม่มีกำหนดการ",
    noScheduleDesc: "ผู้จัดการแข่งขันยังไม่ได้เพิ่มข้อมูลส่วนนี้",
    categoryFallback: "รุ่น",
    noEntriesInGroup: "ยังไม่มีรายการในรุ่นนี้",
    boardNo: (n: string) => ` · กระดานที่ ${n}`,
    noRulesTitle: "ยังไม่มีข้อมูลกฎ กติกา",
    noRulesDesc: "ผู้จัดการแข่งขันยังไม่ได้เพิ่มเนื้อหากฎ กติกา",
    rulesThaiOnly: "เนื้อหากฎ กติกามีเฉพาะภาษาไทย",
    tableScrollHint: "← เลื่อนตารางเพื่อดูข้อมูลเพิ่ม →",
    event: {
      match: "แข่งขัน",
      opening: "พิธีเปิด",
      lunch: "พักเที่ยง",
      closing: "พิธีปิด",
      award: "มอบรางวัล",
      lucky_draw: "จับฉลากของขวัญ",
    },
  },
  participants: {
    title: "รายชื่อผู้เข้าแข่งขัน",
    emptyTitle: "ยังไม่มีผู้สมัคร",
    emptyDesc: "รายชื่อจะปรากฏที่นี่เมื่อมีผู้สมัครเข้ามา",
    searchPlaceholder: "ค้นหาชื่อ…",
    totalCount: (n: number) => `ผู้สมัครทั้งหมด ${n} คน`,
    breakdown: (confirmed: number, pending: number) =>
      ` · ยืนยันแล้ว ${confirmed} · รอตรวจสอบ ${pending}`,
    noMatch: "ไม่พบชื่อที่ค้นหา",
    matchCount: (n: number, total: number) => `พบ ${n} จาก ${total} คน`,
    clearSearch: "ล้างคำค้นหา",
    countPeople: (n: number) => `${n} คน`,
    pendingReview: "รอตรวจสอบ",
  },
  ui: {
    select: "— เลือก —",
    search: "ค้นหา…",
    noItems: "ไม่พบรายการ",
    adding: "กำลังเพิ่ม…",
    addItem: (q: string) => `+ เพิ่ม “${q}”`,
    close: "ปิด",
    showPassword: "แสดงรหัสผ่าน",
    hidePassword: "ซ่อนรหัสผ่าน",
  },
  register: {
    title: "สมัครการแข่งขัน",
    steps: { applicant: "ผู้สมัคร", categories: "เลือกรุ่น", payment: "ชำระเงิน" },

    // Entry gate — blocks the flow up front when registration isn't open,
    // instead of letting the user fill in the whole form and hit a wall later.
    gateTitleBefore: "ยังไม่เปิดรับสมัคร",
    gateDescBefore: (date: string) => `รายการนี้จะเปิดรับสมัครวันที่ ${date}`,
    gateTitleClosed: "ปิดรับสมัครแล้ว",
    gateDescClosed: "ขณะนี้ปิดรับสมัครสำหรับรายการนี้แล้ว",
    gateTitleUnavailable: "ยังไม่เปิดรับสมัคร",
    gateDescUnavailable: "ยังไม่มีรายการแข่งขันที่เปิดรับสมัครในขณะนี้",

    // LINE in-app browser warning
    lineWarnBody:
      "คุณกำลังเปิดหน้านี้ในแอป LINE ซึ่งอาจทำให้อัปโหลดรูปสลิปไม่สำเร็จ แนะนำให้เปิดในเบราว์เซอร์ภายนอก (อาจต้องเข้าสู่ระบบใหม่อีกครั้ง)",
    lineWarnButton: "เปิดในเบราว์เซอร์ภายนอก",

    // Step A — participants
    selectHeading: "เลือกผู้เข้าแข่งขัน",
    selectHint: (max: number) =>
      `เลือกตัวคุณเอง และ/หรือ ผู้เล่นในความดูแล (สูงสุด ${max} คน)`,
    self: "ตัวฉัน",
    meTag: "ฉัน",
    addManagedPlayer: "+ เพิ่มผู้เล่นในความดูแล",
    nextWithCount: (n: number) => `ถัดไป (${n} คน)`,
    maxSelectable: (max: number) => `เลือกได้สูงสุด ${max} คน`,
    selectAtLeastOne: "กรุณาเลือกผู้เข้าแข่งขันอย่างน้อย 1 คน",
    multiSelectCallout: (max: number) =>
      `สมัครให้หลายคนได้ในครั้งเดียว — ติ๊กเลือกได้สูงสุด ${max} คน แล้วชำระเงินรวมเป็นยอดเดียว`,
    selectedCount: (n: number) => `เลือกแล้ว ${n} คน`,

    // Step B — categories
    chooseHeading: "เลือกรุ่น",
    chooseHint: "เลือกรุ่นที่ต้องการสมัครให้แต่ละคน · บางรุ่นลงคู่กันได้ (เช่น 9x9 + 13x13)",
    noTournament: "ไม่พบรายการแข่งขัน",
    levelPrefix: (label: string) => `ระดับ: ${label}`,
    selectCategory1: "— เลือกรุ่น —",
    selectCategory2: "— เลือกรุ่นที่ 2 —",
    seatsFull: "(เต็ม)",
    seatsRemaining: (n: number) => `(เหลือ ${n})`,
    notEligibleSuffix: " · ไม่ตรงเกณฑ์",
    noEligibleCategory: "ไม่มีรุ่นที่ตรงกับระดับฝีมือ/อายุของผู้สมัคร",
    removeSlot: "ลบ",
    addAnotherCategory: "+ ลงอีกรุ่น",
    personFee: (fee: string) => `ค่าสมัคร ${fee} บาท`,
    totalWithSeats: (n: number) => `ยอดรวม (${n} ที่)`,
    changeParticipants: "← เปลี่ยนผู้เข้าแข่งขัน",
    next: "ถัดไป",
    selectAllCategories: "กรุณาเลือกรุ่นให้ครบทุกคน",

    // Reserve errors
    errInsufficientSeats: (name: string, remaining: number, requested: number) =>
      `รุ่น ${name} เหลือ ${remaining} ที่ (ต้องการ ${requested})`,
    errRegistrationClosed: "ขณะนี้ปิดรับสมัครแล้ว",
    errTooMany: (max: number) => `สมัครได้สูงสุด ${max} ที่`,
    errRankNotEligible: (person: string, name: string) =>
      `${person} มีระดับฝีมือไม่ตรงกับรุ่น ${name}`,
    errRankRequired: (person: string) =>
      `${person} ยังไม่ได้ระบุระดับฝีมือ — แก้ไขในโปรไฟล์/ผู้เล่นก่อน`,
    errAgeNotEligible: (person: string, age: number, name: string) =>
      `${person} (อายุ ${age} ปี) อายุไม่ตรงกับรุ่น ${name}`,
    errCombinationNotAllowed: (person: string, name: string, other: string) =>
      `${person} ลงรุ่น ${name} คู่กับ ${other} ไม่ได้ — 1 คนลงได้รุ่นเดียว ยกเว้นรุ่นที่จับคู่กันไว้`,
    errDuplicate: (person: string, name: string, ref: string | null) =>
      `${person} สมัครรุ่น ${name} ไว้แล้ว${ref ? ` (อ้างอิง ${ref})` : ""}`,
    errAwardLimitReached: (person: string, count: number) =>
      `${person} ได้เหรียญรางวัลรุ่น 1 คิว ครบ ${count} ครั้งแล้ว ต้องสอบผ่านดั้งก่อนจึงจะสมัครแข่งได้ — กรุณาติดต่อผู้ดูแล`,
    errReserveFailed: "ไม่สามารถจองที่นั่งได้ กรุณาลองใหม่",
    errBusyRetryConfirm: "ระบบกำลังหนาแน่น กรุณากด “ยืนยัน” อีกครั้ง",

    // Promo errors
    promoInvalid: "ไม่พบโค้ดนี้ในรายการแข่งขัน",
    promoInactive: "โค้ดนี้ถูกปิดใช้งาน",
    promoNotStarted: "ยังไม่ถึงเวลาเริ่มใช้โค้ดนี้",
    promoExpired: "โค้ดนี้หมดอายุแล้ว",
    promoExhausted: "โค้ดนี้ถูกใช้ครบจำนวนแล้ว",
    promoNotPending: "ใบสมัครนี้ใช้โค้ดไม่ได้แล้ว",
    promoForbidden: "ใช้โค้ดกับใบสมัครนี้ไม่ได้",
    promoDefault: "ใช้โค้ดไม่สำเร็จ กรุณาลองใหม่",

    // Payment step
    amountDue: "ยอดเงินที่ต้องชำระ",
    itemsCount: (n: number) => ` (${n} รายการ)`,
    amountBaht: (amount: string) => `${amount} บาท`,
    discountLabel: (amount: string, code: string | null) =>
      `ส่วนลด −${amount}${code ? ` (${code})` : ""}`,
    promoHeading: "โค้ดส่วนลด / สมัครฟรี",
    free: "สมัครฟรี",
    discountAmount: (amount: string) => `ลด ${amount} บาท`,
    usedSuffix: " — ใช้โค้ดแล้ว",
    removeCode: "นำออก",
    enterCode: "กรอกโค้ดที่นี่",
    applyCode: "ใช้โค้ด",
    freeNoPayment: "สมัครฟรี — ไม่ต้องชำระเงิน",
    freeConfirmHint: "กด “ยืนยันการสมัคร” ด้านล่างได้เลย",
    buildingQr: "กำลังสร้าง QR…",
    holdWarn:
      "เราจองที่นั่งให้คุณแล้ว กรุณาชำระเงินและอัปโหลดสลิปภายใน 15 นาที มิฉะนั้นระบบจะคืนที่นั่งและถือว่าสละสิทธิ์",
    uploadSlipHeading: "อัปโหลดสลิปการโอนเงิน",
    editData: "← แก้ไขข้อมูล/รุ่น",
    confirmFree: "ยืนยันการสมัคร (ฟรี)",
    confirm: "ยืนยันการสมัคร",
    understood: "เข้าใจแล้ว",
    successFree: "สมัครสำเร็จแล้ว!",
    received: "ทีมงานได้รับใบสมัครของคุณแล้ว",
    successFreeDesc:
      "ใบสมัครของคุณได้รับการยืนยันเรียบร้อย เก็บหมายเลขอ้างอิงไว้เป็นหลักฐาน",
    reviewDescLead: "เจ้าหน้าที่จะตรวจสอบข้อมูลและการชำระเงิน โดยใช้เวลาประมาณ ",
    reviewDays: "3 วันทำการ",
    reviewDescTail: " จากนั้นสถานะของคุณจะเปลี่ยนเป็น “ยืนยันแล้ว”",
    referenceNo: "หมายเลขอ้างอิง",

    // Payment toasts
    promoFree: "ใช้โค้ดสำเร็จ — สมัครฟรี! 🎉",
    promoDiscountToast: (amount: string) => `ใช้โค้ดแล้ว ลด ${amount} บาท`,
    promoRemoved: "นำโค้ดออกแล้ว",
    promoFailed: "ใช้โค้ดไม่สำเร็จ กรุณาลองใหม่",
    uploadSlipFirst: "กรุณาอัปโหลดสลิปการโอนเงิน",
    holdExpired: "หมดเวลาการจองที่นั่งแล้ว",
    promoJustExhausted: "โค้ดนี้เพิ่งถูกใช้ครบจำนวนแล้ว",
    promoNoLongerValid: "โค้ดส่วนลดใช้ไม่ได้แล้ว กรุณาตรวจสอบอีกครั้ง",
    slipTooLarge: "ไฟล์สลิปใหญ่เกินไป กรุณาใช้รูปที่เล็กลง",
    busyRetrySubmit: "ระบบกำลังหนาแน่น กรุณากด “ยืนยันการสมัคร” อีกครั้ง",
    submitFailed: "ส่งใบสมัครไม่สำเร็จ กรุณาลองใหม่",

    // Success page
    successHeading: "ส่งใบสมัครแล้ว!",
    successDesc:
      "ระบบได้รับใบสมัครและสลิปของคุณแล้ว อยู่ระหว่างรอผู้จัดการแข่งขันตรวจสอบและยืนยัน โดยใช้เวลาประมาณ 3 วันทำการ",
    statusPending: "สถานะ: รอตรวจสอบ",
    saveRefHint:
      "กรุณาบันทึกหมายเลขอ้างอิงไว้ เพื่อใช้ติดตามสถานะหรือสอบถามกับผู้จัดการแข่งขัน",
    screenshotWarnTitle: "แคปหน้าจอนี้เก็บไว้เป็นหลักฐาน",
    screenshotWarnBody:
      "เผื่อเกิดปัญหาหรือข้อผิดพลาดภายหลัง จะได้มีข้อมูลการสมัครและหมายเลขอ้างอิงไว้ยืนยันกับผู้จัด",
    participantsLabel: "ผู้เข้าแข่งขัน",
    viewParticipants: "ดูรายชื่อผู้เข้าแข่งขัน",
    viewMyRegs: "ดูใบสมัครของฉัน",
    backHome: "กลับหน้าหลัก",

    // Expired page
    expiredHeading: "หมดเวลาการจองที่นั่ง",
    expiredDesc:
      "การจองที่นั่งของคุณหมดอายุ (เกิน 15 นาที) ที่นั่งถูกคืนกลับเข้าระบบแล้ว กรุณาเริ่มสมัครใหม่อีกครั้ง",
    restart: "เริ่มสมัครใหม่",

    // Countdown timer
    countdown: (time: string) =>
      `จองที่นั่งไว้ให้ — เหลือเวลาชำระเงิน ${time} นาที`,

    // PromptPay QR
    scanToPay: "สแกนด้วยแอปธนาคารเพื่อชำระเงิน (ระบบจะกรอกยอดให้อัตโนมัติ)",
    scanToPayManual: "สแกนด้วยแอปธนาคาร แล้วกรอกยอดเงินด้วยตนเอง",
    saveQr: "บันทึก QR",
    qrFallbackShow: "สแกนแล้วโอนไม่ได้? ลอง QR สำรอง",
    qrFallbackHide: "กลับไปใช้ QR หลัก",
    qrFallbackNote: (amount: string) =>
      `QR สำรองนี้ไม่ได้ระบุยอดเงิน กรุณากรอกยอดโอนให้ตรงกับ ${amount} บาท ก่อนยืนยันการโอน`,
    copyAmount: "คัดลอกยอดเงิน",
    copiedAmount: "คัดลอกแล้ว",

    // Slip uploader
    slipTooBig: "ไฟล์ใหญ่เกินไป (สูงสุด 8MB)",
    slipStillTooBig:
      "รูปสลิปมีขนาดใหญ่เกินไป กรุณาแคปหน้าจอสลิป (screenshot) แล้วอัปโหลดรูปนั้นแทน",
    imagesOnly: "รองรับเฉพาะไฟล์รูปภาพ",
    readFailed: "อ่านไฟล์ไม่สำเร็จ",
    changeSlip: "เปลี่ยน/ลบสลิป",
    processing: "กำลังประมวลผล…",
    tapToUpload: "แตะเพื่ออัปโหลดสลิปการโอนเงิน",
    fileHint: "PNG, JPG (สูงสุด 8MB)",
  },
  person: {
    titlePrefix: "คำนำหน้าชื่อ",
    titleCustom: "ระบุคำนำหน้า",
    titleCustomPlaceholder: "เช่น ดร.",
    titleOther: "อื่นๆ",
    firstNameTh: "ชื่อ (ไทย)",
    firstNameThPlaceholder: "สมชาย",
    lastNameTh: "นามสกุล (ไทย)",
    lastNameThPlaceholder: "ใจดี",
    firstNameEn: "Name (English)",
    firstNameEnHint: "ไม่บังคับ · เติมภายหลังได้",
    lastNameEn: "Surname (English)",
    hasMiddle: "มีชื่อกลางไหม?",
    middleNameTh: "ชื่อกลาง (ไทย)",
    middleNameEn: "Middle name (Eng)",
    phone: "เบอร์โทรศัพท์",
    phoneHint: "เบอร์มือถือ 10 หลัก",
    dob: "วันเดือนปีเกิด",
    dobHint: "กรอกปี ค.ศ. หรือ พ.ศ. ก็ได้ ระบบตรวจให้อัตโนมัติ",
    day: "วัน",
    month: "เดือน",
    year: "ปี",
    province: "จังหวัดที่อาศัย",
    selectProvince: "— เลือกจังหวัด —",
    searchProvince: "ค้นหาจังหวัด…",
    noProvince: "ไม่พบจังหวัด",
    institute: "สถาบันหมากล้อมที่ศึกษา",
    instituteHint: "พิมพ์เพื่อค้นหา หรือเพิ่มสถาบันใหม่ได้",
    selectInstitute: "— เลือกสถาบัน —",
    searchInstitute: "ค้นหาหรือพิมพ์ชื่อสถาบัน…",
    noInstitute: "ยังไม่มีสถาบันในระบบ — พิมพ์เพื่อเพิ่มใหม่",
    addInstitute: (q: string) => `+ เพิ่มสถาบัน “${q}”`,
    pdpaConsent:
      "ข้าพเจ้ายินยอมให้เก็บรวบรวมและใช้ข้อมูลส่วนบุคคลเพื่อการสมัครและจัดการแข่งขัน ตามนโยบายความเป็นส่วนตัว (PDPA)",
    pdpaReadPolicy: "อ่านนโยบายความเป็นส่วนตัว (PDPA)",
    categoryToRegister: "รุ่นที่ต้องการสมัคร",
    selectCategory: "— เลือกรุ่น —",
    sameAsOwner: "เหมือนเจ้าของบัญชี",
    fillOwn: "กรอกเอง",
    dash: "—",
  },
  rank: {
    label: "ระดับฝีมือ",
    hint: "ตรวจสอบจากฐานข้อมูลด้วยชื่อ-นามสกุล · ถ้าไม่พบจะกำหนดเป็น 15 คิว (มือใหม่)",
    sourceDan: "ฐาน Dan",
    sourceKyu: "ฐาน Kyu",
    sourceAward: "ฐานรางวัล",
    matchExact: "ตรงทุกตัวอักษร",
    matchNormalized: "ตรงหลังปรับรูปคำ",
    matchFuzzy: "ใกล้เคียง",
    enterNameFirst: "กรอกชื่อและนามสกุล (ไทย) ก่อนตรวจสอบ",
    searchFailed: "ค้นหาไม่สำเร็จ",
    notFoundAssign: "ไม่พบในฐานข้อมูล — กำหนดเป็น",
    fifteenKyu: "15 คิว",
    beginner: "(มือใหม่)",
    verifiedFromDb: "✓ ยืนยันจากฐานข้อมูล",
    verifiedFromDbNamed: (name: string) => `✓ ยืนยันจากฐานข้อมูล: ${name} —`,
    nameFixPrompt: (name: string) =>
      `ฐานข้อมูลสะกดชื่อว่า “${name}” — ใช้การสะกดนี้ไหม?`,
    nameFixUse: "ใช้ชื่อตามฐานข้อมูล",
    nameFixKeep: "เก็บชื่อที่พิมพ์ไว้",
    currentLevel: "● ระดับปัจจุบัน",
    searching: "กำลังค้นหา…",
    recheck: "ตรวจสอบใหม่จากฐานข้อมูล",
    checkDb: "ตรวจสอบจากฐานข้อมูล",
    nearMatches: (n: number) => `พบ ${n} รายชื่อที่ใกล้เคียง — เลือกของคุณ`,
    selected: "✓ เลือกไว้",
    notInList: "ไม่มีฉันในรายการ — เลือกระดับเอง",
    notThisRank: "ไม่ใช่ระดับนี้? เลือกเอง",
    chooseManual: "เลือกระดับฝีมือ",
    manualNote:
      "หมายเหตุ: ระดับฝีมือ 15 คิว สำหรับแข่งขันรุ่นกระดาน 9x9 และระดับฝีมือ 14 คิว สำหรับแข่งขันรุ่นกระดาน 13x13",
    awardBanWarningTitle: "ถูกระงับการสมัคร — ได้เหรียญรุ่น 1 คิว ตั้งแต่ 3 ครั้ง",
    awardBanWarningBody: (count: number) =>
      `ผู้เล่นนี้ได้เหรียญรางวัลรุ่น 1 คิว ${count} ครั้ง และยังไม่มีข้อมูลในฐานดั้ง ต้องสอบผ่านดั้งก่อนจึงจะสมัครได้ หากเป็นการจับคู่ชื่อผิดพลาด ผู้ดูแลสามารถยกเว้นให้เป็นรายบุคคลได้`,
    // Candidate-card proof lines (wording matches the pre-i18n buildEvidence
    // output exactly, so Thai mode is pixel-identical).
    evidenceYearPromoted: (y: number) => `สอบผ่านปี ${y}`,
    evidenceRating: (r: number) => `เรตติ้ง ${r}`,
    evidenceDiamond: (d: string) => `diamond ${d}`,
    evidenceKyuPassed: (d: string) => `สอบผ่าน ${d}`,
    historyTitle: "ประวัติจากฐานข้อมูล",
    historyRankLevel: (rank: string) => `ระดับฝีมือ ${rank}`,
    historySeq: (seq: string) => `หมายเลขประจำตัว (seq) = ${seq}`,
    historyGat: (gat: string) => `Gat point (gat) = ${gat}`,
    historyYearPromoted: (y: number) => `ปีที่สอบผ่าน ${y}`,
    historyDiamond: (d: string) => `Diamond ${d}`,
    historyKyuPassed: (rank: string) => `สอบผ่าน ${rank}`,
    historyAwardPlace: (n: number) => `ได้อันดับ ${n}`,
    historyAwardCategory: (c: string) => `รุ่น ${c}`,
    historyAwardGroup: (g: string) => `กลุ่ม ${g}`,
    historyAwardEvent: (e: string) => `งาน ${e}`,
    historyAwardDate: (d: string) => `วันที่ ${d}`,
  },
  auth: {
    // Login
    loginTitle: "เข้าสู่ระบบ",
    loginSubtitle: "เข้าสู่ระบบเพื่อสมัครการแข่งขัน",
    email: "อีเมล",
    password: "รหัสผ่าน",
    passwordPlaceholder: "รหัสผ่าน",
    forgotPassword: "ลืมรหัสผ่าน?",
    signInButton: "เข้าสู่ระบบ",
    noAccount: "ยังไม่มีบัญชี?",
    createAccountLink: "สมัครบัญชีใหม่",
    errEmailNotConfirmed: "บัญชีนี้ยังไม่ได้ยืนยันอีเมล กรุณาตรวจสอบกล่องอีเมลของคุณ",
    errInvalidCredentials: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
    errLoginFailed: "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่",

    // Signup
    signupTitle: "สมัครบัญชี",
    signupHeading: "สมัครบัญชีใหม่",
    signupSubtitle: "สร้างบัญชีครั้งเดียว ครั้งต่อไปไม่ต้องกรอกข้อมูลซ้ำ",
    passwordHint: "อย่างน้อย 6 ตัวอักษร",
    confirmPassword: "ยืนยันรหัสผ่าน",
    signUpButton: "สมัครบัญชี",
    haveAccount: "มีบัญชีแล้ว?",
    signInLink: "เข้าสู่ระบบ",
    errPasswordMin: "รหัสผ่านอย่างน้อย 6 ตัวอักษร",
    errPasswordMismatch: "รหัสผ่านยืนยันไม่ตรงกัน",
    errEmailExists: "อีเมลนี้มีบัญชีอยู่แล้ว — ลองเข้าสู่ระบบแทน",
    errSignupFailed: (m: string) => "สมัครไม่สำเร็จ: " + m,
    checkEmailTitle: "ตรวจสอบอีเมลของคุณ",
    confirmSentLead: "เราส่งลิงก์ยืนยันไปที่ ",
    confirmSentTail: " แล้ว กรุณาคลิกลิงก์ในอีเมลเพื่อยืนยันบัญชี แล้วกลับมาเข้าสู่ระบบ",
    goToLogin: "ไปหน้าเข้าสู่ระบบ",

    // Forgot password
    forgotTitle: "ลืมรหัสผ่าน",
    forgotSubtitle: "กรอกอีเมลที่ใช้สมัคร เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้",
    sendResetLink: "ส่งลิงก์รีเซ็ตรหัสผ่าน",
    rememberedPassword: "นึกรหัสผ่านได้แล้ว?",
    errResetRequestFailed: "ส่งคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
    resetSentLead: "ถ้ามีบัญชีที่ใช้ ",
    resetSentTail:
      " เราได้ส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้แล้ว กรุณาคลิกลิงก์ในอีเมลเพื่อดำเนินการต่อ",
    backToLogin: "กลับไปหน้าเข้าสู่ระบบ",

    // Reset password
    resetTitle: "ตั้งรหัสผ่านใหม่",
    resetForAccountLead: "ตั้งรหัสผ่านใหม่สำหรับบัญชี ",
    newPassword: "รหัสผ่านใหม่",
    confirmNewPassword: "ยืนยันรหัสผ่านใหม่",
    saveNewPassword: "บันทึกรหัสผ่านใหม่",
    checkingLink: "กำลังตรวจสอบลิงก์…",
    invalidLinkTitle: "ลิงก์ไม่ถูกต้อง",
    invalidLinkDesc: "ลิงก์รีเซ็ตรหัสผ่านหมดอายุหรือไม่ถูกต้อง กรุณาขอลิงก์ใหม่อีกครั้ง",
    requestNewLink: "ขอลิงก์ใหม่",
    resetDoneTitle: "ตั้งรหัสผ่านใหม่แล้ว",
    resetDoneDesc: "คุณเข้าสู่ระบบด้วยรหัสผ่านใหม่เรียบร้อยแล้ว",
    continueApp: "เข้าใช้งานต่อ",
    errRecoveryMissing: "ลิงก์รีเซ็ตหมดอายุหรือไม่ถูกต้อง กรุณาขอลิงก์ใหม่อีกครั้ง",
    errResetFailed: "ตั้งรหัสผ่านใหม่ไม่สำเร็จ กรุณาลองใหม่",
  },
  profile: {
    headerTitle: "ข้อมูลส่วนตัว",
    editTitle: "ข้อมูลส่วนตัวของฉัน",
    firstTitle: "กรอกข้อมูลส่วนตัว (ครั้งแรก)",
    subtitle: "บันทึกครั้งเดียว ครั้งต่อไปจะถูกเติมให้อัตโนมัติเมื่อสมัคร",
    saved: "บันทึกข้อมูลส่วนตัวแล้ว",
  },
  players: {
    headerTitle: "ผู้เล่นในความดูแล",
    subtitle: "บันทึกผู้เล่นที่คุณดูแล (เช่น ลูกทีม/บุตรหลาน) เพื่อใช้สมัครซ้ำได้สะดวก",
    emptyTitle: "ยังไม่มีผู้เล่นในความดูแล",
    emptyDesc: "กดปุ่มด้านล่างเพื่อเพิ่มผู้เล่นคนแรก",
    lockedNote: "มีรายการสมัครแข่งขัน — ลบไม่ได้",
    lockedTitle: "ผู้เล่นนี้มีรายการสมัครแข่งขัน จึงลบไม่ได้",
    addPlayer: "+ เพิ่มผู้เล่น",
    confirmDelete: (name: string) => `ลบ "${name}" ออกจากรายชื่อ?`,
    deleted: "ลบผู้เล่นแล้ว",
    hasRegistrations: "ผู้เล่นนี้มีรายการสมัครแข่งขันอยู่ จึงลบไม่ได้",
    deleteFailed: "ลบผู้เล่นไม่สำเร็จ ลองใหม่อีกครั้ง",
    addTitle: "เพิ่มผู้เล่น",
    editTitle: "แก้ไขผู้เล่น",
    added: "เพิ่มผู้เล่นแล้ว",
    editSaved: "บันทึกการแก้ไขแล้ว",
  },
  // Search / filter / sort bar over player lists (account page + register step A).
  // "registered" is checked against live registrations in the current tournament.
  playerFilter: {
    searchPlaceholder: "ค้นหาชื่อผู้เล่น / เบอร์โทร…",
    sortLabel: "เรียงลำดับ",
    sortName: "เรียงชื่อ ก-ฮ",
    sortRankDesc: "ฝีมือ สูง→ต่ำ",
    sortRankAsc: "ฝีมือ ต่ำ→สูง",
    filterAll: "ทั้งหมด",
    filterNotRegistered: "ยังไม่สมัคร",
    filterRegistered: "สมัครแล้ว",
    registeredTag: "สมัครแล้ว",
    noMatch: "ไม่พบผู้เล่นที่ตรงกับการค้นหา/ตัวกรอง",
  },
  myReg: {
    badgeActionNeeded: "มีรายการที่ต้องดำเนินการ",
    subtitle: "ใบสมัครทั้งหมดของคุณ พร้อมสถานะและรุ่นที่ลงไว้",
    emptyTitle: "ยังไม่มีการสมัคร",
    emptyDesc: "เมื่อคุณสมัครแข่งขัน ใบสมัครและสถานะจะแสดงที่นี่",
    registerAction: "สมัครแข่งขัน",
    tournamentFallback: "การแข่งขัน",
    refLine: (ref: string, date: string) => `รหัสใบสมัคร ${ref} · ${date}`,
    total: "ยอดรวม ",
    noteConfirmed: "✓ ยืนยันการสมัครเรียบร้อย",
    notePendingReview: "⏳ รอผู้จัดตรวจสอบสลิป",
    noteRejected: (note: string | null) => `✕ ถูกปฏิเสธ${note ? `: ${note}` : ""}`,
    notePendingPayment: "ยังไม่ได้ส่งสลิป — รอการชำระเงิน",
    payNow: "ชำระเงิน / ดู QR",
    noteExpired: "หมดเวลาจอง (ไม่ได้ชำระเงินทันเวลา)",
    noteDefault: "ยังไม่เสร็จสิ้น",
    showExpired: (n: number) => `ดูใบสมัครที่หมดเวลา (${n})`,
    hideExpired: "ซ่อนใบสมัครที่หมดเวลา",
    withdrawnBadge: "ถอนตัวแล้ว",
    withdrawAction: "ถอนตัว",
    swapAction: "เปลี่ยนคน",
    changeDivisionAction: "เปลี่ยนรุ่น",
    pendingUpgrade: (cat: string) => `รอตรวจสลิปส่วนต่าง → ${cat}`,
    pendingDowngrade: (cat: string) => `รอโอนคืนส่วนต่าง → ${cat}`,
    changeRejected: (reason: string | null) =>
      `คำขอเปลี่ยนรุ่นไม่ผ่าน${reason ? `: ${reason}` : ""}`,
  },
  withdraw: {
    title: "ถอนตัวจากการแข่งขัน",
    seatFee: (fee: string) => `ค่าสมัคร ${fee} บาท`,
    warningTitle: "โปรดอ่านก่อนยืนยันการถอนตัว",
    warningBody:
      "การถอนตัวจะมีผลทันทีและไม่สามารถย้อนกลับได้ ชื่อของผู้สมัครจะถูกนำออกจากรายชื่อผู้เข้าแข่งขัน และที่นั่งจะถูกเปิดให้ผู้อื่นสมัครแทน ทั้งนี้ การคืนค่าสมัครอยู่ในดุลยพินิจของทีมงานผู้จัดการแข่งขันแต่เพียงผู้เดียว ทีมงานจะพิจารณาเป็นรายกรณี และขอสงวนสิทธิ์ในการคืนเงินเต็มจำนวน คืนบางส่วน หรือไม่คืนเงิน หากอนุมัติการคืนเงิน ทีมงานจะโอนเข้าบัญชีตามข้อมูลที่ท่านระบุไว้ด้านล่าง",
    bankInfoHeading: "ข้อมูลบัญชีสำหรับรับเงินคืน",
    bankName: "ธนาคาร",
    bankNamePlaceholder: "เช่น ธนาคารกสิกรไทย",
    accountNo: "เลขที่บัญชี",
    accountNoPlaceholder: "เลขบัญชีสำหรับรับเงินคืน",
    accountName: "ชื่อบัญชี",
    accountNamePlaceholder: "ชื่อ-นามสกุลเจ้าของบัญชี",
    reasonLabel: "สาเหตุที่ถอนตัว",
    reasonPlaceholder: "ไม่บังคับ — ระบุเหตุผลเพื่อประกอบการพิจารณาของทีมงาน",
    confirm: "ยืนยันถอนตัว",
    cancel: "ยกเลิก",
    success:
      "ถอนตัวเรียบร้อยแล้ว ทีมงานจะพิจารณาการคืนเงินและติดต่อกลับตามข้อมูลบัญชีที่ให้ไว้",
    errRequired: "กรุณากรอกข้อมูลบัญชีรับเงินคืนให้ครบถ้วน",
    errAccountNo: "เลขที่บัญชีไม่ถูกต้อง — กรอกเฉพาะตัวเลข (มีขีดหรือเว้นวรรคได้)",
    errAlready: "ที่นั่งนี้ถูกถอนตัวไปแล้ว",
    errGeneric: "ถอนตัวไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
  },
  swap: {
    title: "เปลี่ยนคนเข้าแข่งขัน",
    intro: "เลือกผู้เข้าแข่งขันคนใหม่สำหรับที่นั่งนี้ (รุ่นเดิม)",
    pickPerson: "เลือกผู้เข้าแข่งขันคนใหม่",
    self: "ตัวฉัน",
    meTag: "ฉัน",
    addPlayer: "+ เพิ่มผู้เล่นใหม่",
    personNotEligible:
      "ผู้เล่นคนนี้ไม่มีสิทธิ์ลงรุ่นนี้ (ระดับฝีมือ/อายุไม่ตรงเกณฑ์) — หากต้องการย้ายรุ่น ใช้ปุ่ม “เปลี่ยนรุ่น”",
    confirm: "ยืนยันเปลี่ยนคน",
    cancel: "ยกเลิก",
    success: "เปลี่ยนคนเข้าแข่งขันเรียบร้อยแล้ว",
    errClosed: "ปิดรับสมัครแล้ว จึงไม่สามารถเปลี่ยนคนได้",
    errSamePerson: "เป็นผู้เข้าแข่งขันคนเดิมอยู่แล้ว",
    errAlready: "ที่นั่งนี้ถูกถอนตัวไปแล้ว",
    errGeneric: "เปลี่ยนคนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
  },
  divChange: {
    title: "เปลี่ยนรุ่นการแข่งขัน",
    intro: "เลือกรุ่นใหม่สำหรับผู้เข้าแข่งขันคนเดิม",
    currentDivision: "รุ่นปัจจุบัน",
    pickDivision: "เลือกรุ่นใหม่",
    feeLine: (fee: string) => `ค่าสมัคร ${fee} บาท`,
    deltaMore: (amt: string) => `+${amt} บาท`,
    deltaLess: (amt: string) => `−${amt} บาท`,
    deltaSame: "ค่าสมัครเท่าเดิม",
    deltaEstimateNote:
      "ใบสมัครนี้ใช้ส่วนลด ยอดส่วนต่างจริงคำนวณจากยอดสุทธิหลังส่วนลด",
    checking: "กำลังตรวจสอบ…",
    evenNote:
      "รุ่นใหม่ค่าสมัครสุทธิเท่าเดิม — ยืนยันแล้วเปลี่ยนรุ่นได้ทันที ไม่ต้องรอตรวจสอบ",
    confirmEven: "ยืนยันเปลี่ยนรุ่น",
    payHeading: (amt: string) => `ชำระส่วนต่าง ${amt} บาท`,
    payNote:
      "สแกน QR โอนตามยอดส่วนต่าง แล้วแนบสลิปเพื่อส่งคำขอ — รุ่นจะเปลี่ยนเมื่อทีมงานตรวจสอบสลิปและอนุมัติ",
    slipLabel: "สลิปโอนส่วนต่าง",
    confirmUpgrade: "ส่งคำขอเปลี่ยนรุ่น",
    refundHeading: (amt: string) => `รับเงินคืนส่วนต่าง ${amt} บาท`,
    refundNote:
      "รุ่นใหม่ค่าสมัครถูกกว่าเดิม ทีมงานจะโอนส่วนต่างคืนเข้าบัญชีด้านล่าง — รุ่นจะเปลี่ยนเมื่อทีมงานยืนยันการโอนคืนแล้ว",
    confirmDowngrade: "ส่งคำขอเปลี่ยนรุ่น",
    successMoved: "เปลี่ยนรุ่นเรียบร้อยแล้ว",
    successPendingUpgrade:
      "ส่งคำขอแล้ว — รอทีมงานตรวจสอบสลิป รุ่นจะเปลี่ยนเมื่ออนุมัติ",
    successPendingDowngrade:
      "ส่งคำขอแล้ว — ทีมงานจะโอนส่วนต่างคืนและยืนยัน รุ่นจะเปลี่ยนเมื่อเสร็จสิ้น",
    noEligible: "ไม่มีรุ่นอื่นที่ผู้เข้าแข่งขันคนนี้มีสิทธิ์ลง",
    errPending: "ที่นั่งนี้มีคำขอเปลี่ยนรุ่นค้างอยู่แล้ว รอทีมงานดำเนินการก่อน",
    errNoChange: "เป็นรุ่นเดิมอยู่แล้ว",
    errClosed: "ปิดรับสมัครแล้ว จึงไม่สามารถเปลี่ยนรุ่นได้",
    errSlipRequired: "กรุณาแนบสลิปโอนส่วนต่างก่อนส่งคำขอ",
    errAlready: "ที่นั่งนี้ถูกถอนตัวไปแล้ว",
    errGeneric: "เปลี่ยนรุ่นไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
  },
  status: {
    draft: "ร่าง",
    pending_payment: "รอชำระเงิน",
    pending_review: "รอตรวจสอบ",
    confirmed: "ยืนยันแล้ว",
    rejected: "ปฏิเสธ",
    expired: "หมดเวลา",
    cancelled: "ยกเลิก",
  },
  // Zod messages for the public personal form (lib/validation/schemas.ts).
  // Thai wording is lifted verbatim from the pre-i18n schema literals so the
  // Thai experience is unchanged. Admin schemas keep their own Thai literals.
  validation: {
    required: "กรุณากรอก",
    thaiOnly: "กรุณากรอกเป็นภาษาไทย",
    englishOnly: "กรุณากรอกเป็นภาษาอังกฤษ",
    phoneRequired: "กรุณากรอกเบอร์โทรศัพท์",
    phoneInvalid: "เบอร์มือถือไม่ถูกต้อง (เช่น 0812345678)",
    dayInvalid: "วันไม่ถูกต้อง",
    monthInvalid: "เดือนไม่ถูกต้อง",
    yearFourDigits: "ปีต้องมี 4 หลัก",
    birthYearInvalid: "ปีเกิดไม่ถูกต้อง",
    dobInvalid: "วันเกิดไม่ถูกต้อง",
    rankRequired: "กรุณาเลือกระดับฝีมือ",
    rankInvalid: "ระดับฝีมือไม่ถูกต้อง",
    provinceRequired: "กรุณาเลือกจังหวัด",
    instituteRequired: "กรุณาเลือกหรือระบุสถาบัน",
    pdpaRequired: "กรุณายอมรับนโยบายความเป็นส่วนตัว (PDPA)",
    titleCustomRequired: "กรุณาระบุคำนำหน้า",
    middleNameRequired: "กรุณากรอกชื่อกลาง",
  },
  // /live board HTML shell (app/live/route.ts). These are interpolated into a
  // raw HTML template — keep every string free of <, >, and &, and keep the
  // ATTRIBUTE-interpolated keys (metaDescription, *Title, mapAlt, the search
  // placeholder) free of double quotes too; text-node keys may contain them.
  // Thai wording is verbatim from the pre-i18n markup.
  live: {
    metaDescription: "ผลการแข่งขันหมากล้อมสด TESUJI Go Competition Organizer",
    backHome: "หน้าหลัก",
    backHomeTitle: "กลับหน้าหลัก",
    themeToggleTitle: "สลับโหมดสว่าง/มืด",
    badgeSchedule: "กำหนดการ",
    badgeMap: "แผนที่",
    badgeHelp: "วิธีใช้",
    loading: "กำลังโหลดข้อมูลการแข่งขัน...",
    thTable: "โต๊ะ",
    thName: "ชื่อ",
    thResult: "ผล",
    subFabTitle: "ติดตามผลของฉัน",
    subBackTitle: "ย้อนกลับ",
    subTitle: "ติดตามผลของฉัน 🔔",
    subSearchPlaceholder: "ค้นหาชื่อ...",
    subStepDivision: "เลือกสาย",
    histTitle: "ผลงาน",
    helpTitle: "วิธีใช้งาน",
    helpViewHeading: "ดูผลการแข่งขัน",
    helpViewDesc:
      "กดที่ชื่อรุ่นเพื่อดูผลแต่ละรอบ สามารถเลือกรอบได้จากปุ่มด้านบน ผลจะอัพเดทแบบ real-time อัตโนมัติ",
    helpFollowHeading: "ติดตามผลของฉัน",
    helpFollowDesc:
      "กดปุ่ม 🔔 มุมขวาล่าง → เลือกสาย → เลือกชื่อ ระบบจะแสดงการ์ดผลการแข่งของคุณด้านบน พร้อมแจ้งเตือนเมื่อผลเปลี่ยน",
    helpScheduleHeading: "กำหนดการแข่งขัน",
    helpScheduleDesc:
      'กดปุ่ม "📅 กำหนดการ" ด้านบน จะเห็นตารางเวลาทุกรุ่น พร้อมสถานะ กำลังแข่ง / เสร็จแล้ว / ถัดไป',
    helpMapHeading: "แผนผังงาน",
    helpMapDesc:
      'กดปุ่ม "🗺️ แผนที่" ด้านบน เพื่อดูผังโต๊ะแข่งและจุดต่างๆ ในงาน ลากเลื่อน / บีบนิ้วซูมหาโต๊ะของคุณได้',
    helpHistoryHeading: "ดูประวัติผลงาน",
    helpHistoryDesc:
      'เมื่อกดติดตามแล้ว จะมีปุ่ม "ดูผลงานทุกรอบ" ในการ์ด กดเพื่อดูผลแต่ละรอบย้อนหลังทั้งหมด',
    helpDismiss: "เข้าใจแล้ว!",
    scheduleModalTitle: "📅 กำหนดการแข่งขัน",
    mapTitle: "🗺️ แผนผังงาน",
    mapCloseTitle: "ปิด",
    mapAlt: "แผนผังงาน",
    mapHint: "ลากเพื่อเลื่อน · บีบนิ้วหรือแตะสองครั้งเพื่อซูม",
  },
  // /privacy — the PDPA notice the registration consent box links to. Written
  // to match what the system actually stores and does; if the app starts
  // collecting or sharing something new, this section changes with it.
  privacy: {
    title: "นโยบายความเป็นส่วนตัว",
    updated: (date: string) => `ปรับปรุงล่าสุด ${date}`,
    intro:
      "ประกาศนี้บอกว่าระบบรับสมัครนี้เก็บข้อมูลส่วนบุคคลอะไรบ้าง เก็บไปใช้ทำอะไร ใครเห็นบ้าง เก็บไว้นานเท่าไร และคุณขอให้ทำอะไรกับข้อมูลของคุณได้บ้าง เนื้อหาเขียนตามที่ระบบทำงานจริง",

    controllerTitle: "ผู้ควบคุมข้อมูลส่วนบุคคล",
    controllerBody:
      "ผู้จัดการแข่งขันเป็นผู้ควบคุมข้อมูลส่วนบุคคลที่เก็บผ่านระบบนี้ และเป็นผู้ตัดสินใจว่าจะใช้ข้อมูลอย่างไร คำขอทุกเรื่องเกี่ยวกับข้อมูลของคุณ ให้ติดต่อผู้จัดตามช่องทางนี้",
    controllerNameLabel: "ผู้จัดการแข่งขัน",
    controllerNamePlaceholder: "[ ยังไม่ได้ระบุชื่อผู้จัด ]",
    controllerContactLabel: "ติดต่อเรื่องข้อมูลส่วนบุคคล",
    controllerContactPlaceholder: "[ ยังไม่ได้ระบุอีเมลหรือเบอร์โทรสำหรับติดต่อ ]",
    controllerTodo:
      "ผู้จัดต้องกรอกชื่อและช่องทางติดต่อจริงลงในประกาศนี้ก่อนเปิดรับสมัคร",

    collectTitle: "ข้อมูลที่ระบบเก็บ",
    collectAccountTerm: "บัญชีผู้ใช้",
    collectAccountBody:
      "อีเมลที่ใช้สมัครบัญชี ส่วนรหัสผ่านถูกเก็บเป็นค่าที่เข้ารหัสทางเดียว ทั้งระบบและผู้จัดอ่านรหัสผ่านของคุณไม่ได้",
    collectPersonTerm: "ผู้เข้าแข่งขัน",
    collectPersonBody:
      "คำนำหน้าชื่อ ชื่อ–นามสกุลภาษาไทยและภาษาอังกฤษ (รวมชื่อกลางถ้ามี) เบอร์โทรศัพท์ วันเดือนปีเกิด จังหวัดที่อาศัย สถาบันหมากล้อมที่ศึกษา ระดับฝีมือ และการกดยอมรับประกาศนี้พร้อมวันเวลาที่กด",
    collectSubmitterTerm: "ผู้ยื่นใบสมัคร",
    collectSubmitterBody:
      "ถ้าคุณสมัครแทนคนอื่น เช่น ผู้ปกครองหรือโค้ช ระบบจะเก็บชื่อ เบอร์โทร และอีเมลบัญชีของคุณไว้กับใบสมัครนั้น เพื่อให้ทีมงานติดต่อกลับได้",
    collectRankTerm: "ประวัติระดับฝีมือ",
    collectRankBody:
      "เมื่อชื่อของผู้เข้าแข่งขันตรงกับฐานข้อมูลระดับฝีมือของสมาคมหมากล้อม ระบบจะเชื่อมชื่อนั้นเข้ากับประวัติในฐานข้อมูล ได้แก่ ผลสอบขั้นดั้ง/คิว ปีที่สอบผ่าน และรางวัลที่เคยได้รับ เพื่อใช้ตรวจสิทธิ์รุ่น",
    collectPaymentTerm: "การชำระเงิน",
    collectPaymentBody:
      "ภาพสลิปโอนเงินที่คุณอัปโหลด และข้อมูลที่อ่านได้จากสลิป ได้แก่ ชื่อผู้โอน ยอดเงิน วันเวลาที่โอน เลขอ้างอิงรายการ และธนาคาร/บัญชีปลายทาง · ระบบไม่รับและไม่เก็บเลขบัตรเครดิต",
    collectRefundTerm: "การคืนเงิน",
    collectRefundBody:
      "เมื่อถอนตัวหรือเปลี่ยนไปรุ่นที่ค่าสมัครถูกกว่า ระบบจะเก็บชื่อธนาคาร เลขที่บัญชี และชื่อบัญชีที่คุณใช้รับเงินคืน รวมถึงเหตุผลที่ถอนตัวถ้ากรอกไว้",
    collectNote:
      "ระบบไม่ขอเลขบัตรประชาชน และไม่เก็บข้อมูลอ่อนไหวอย่างข้อมูลสุขภาพ ศาสนา หรือเชื้อชาติ",

    useTitle: "ใช้ข้อมูลทำอะไร",
    useRegister:
      "รับสมัคร จองที่นั่ง และติดต่อกลับเรื่องใบสมัครทางเบอร์โทรที่ให้ไว้",
    useEligibility:
      "ตรวจสิทธิ์รุ่น — วันเกิดใช้คำนวณอายุ ระดับฝีมือใช้เทียบเกณฑ์ของแต่ละรุ่น และใช้กันการสมัครซ้ำกับการลงรุ่นที่ต่ำกว่าฝีมือจริง",
    usePayment: "ตรวจสลิปกับยอดที่ต้องชำระ แล้วยืนยันใบสมัคร",
    usePairing:
      "จัดคู่แข่ง ประกาศรายชื่อผู้เข้าแข่งขัน ตารางแข่ง และผลการแข่งขัน",
    useAwards:
      "บันทึกผลรางวัลเข้าฐานข้อมูลของสมาคมหมากล้อม เพื่อใช้อ้างอิงระดับฝีมือในรายการต่อ ๆ ไป",
    useRefund: "ดำเนินการคืนเงินเมื่อถอนตัวหรือเปลี่ยนรุ่น",

    shareTitle: "ใครเห็นข้อมูลบ้าง",
    sharePublicTerm: "ผู้ชมทั่วไป",
    sharePublicBody:
      "หน้ารายชื่อผู้เข้าแข่งขัน ตารางจับคู่ และผลการแข่งขัน เปิดให้ดูได้โดยไม่ต้องเข้าสู่ระบบ และแสดงชื่อ–นามสกุลภาษาไทย รุ่นที่ลง และผลการแข่ง · เบอร์โทร วันเกิด สลิป และข้อมูลบัญชีธนาคาร ไม่แสดงในหน้าสาธารณะ",
    shareOrganizerTerm: "ทีมงานผู้จัด",
    shareOrganizerBody:
      "ผู้ดูแลระบบของรายการแข่งขันเห็นข้อมูลใบสมัครทั้งหมด รวมถึงสลิปและบัญชีสำหรับรับเงินคืน เพื่อตรวจสอบและดำเนินการ",
    shareAssociationTerm: "ฐานข้อมูลของสมาคมหมากล้อม",
    shareAssociationBody:
      "ระบบเทียบชื่อผู้เข้าแข่งขันกับฐานข้อมูลระดับฝีมือของสมาคม และเมื่อจบงาน ผู้จัดจะบันทึกผลรางวัลกลับเข้าฐานข้อมูลนั้น",
    shareProcessorsTerm: "ผู้ให้บริการที่ประมวลผลแทน",
    shareProcessorsBody:
      "SlipOK ใช้ตรวจสลิปอัตโนมัติ (ภาพสลิปถูกส่งไปตรวจ) · Supabase เก็บฐานข้อมูลและไฟล์ · Vercel ให้บริการโฮสต์เว็บ — ทั้งหมดใช้ข้อมูลเพื่อให้บริการนี้เท่านั้น",
    shareNote: "ระบบไม่ขาย ไม่แลกเปลี่ยน และไม่ส่งข้อมูลของคุณให้ใครเพื่อการโฆษณา",

    minorTitle: "ผู้เข้าแข่งขันที่อายุต่ำกว่า 18 ปี",
    minorBody:
      "ถ้าผู้เข้าแข่งขันอายุต่ำกว่า 18 ปี ผู้ปกครองเป็นผู้ให้ความยินยอมแทน — การกดยอมรับในใบสมัครถือว่าผู้ปกครองเป็นผู้กด · ผู้ที่กรอกใบสมัครแทนคนอื่น เช่น ผู้ปกครองหรือโค้ช ต้องได้รับอนุญาตจากเจ้าของข้อมูลหรือผู้ปกครองก่อนกรอกข้อมูล",

    keepTitle: "เก็บข้อมูลไว้นานแค่ไหน",
    keepProfileBody:
      "โปรไฟล์และผู้เล่นในกำกับเก็บไว้ตราบที่บัญชียังอยู่ เพื่อให้ใช้สมัครรายการต่อไปได้โดยไม่ต้องกรอกใหม่",
    keepRegistrationBody:
      "ใบสมัคร สลิป และข้อมูลบัญชีสำหรับรับเงินคืน เก็บไว้ระหว่างจัดการแข่งขัน และหลังจบงานเท่าที่ผู้จัดยังต้องใช้ตรวจสอบยอดเงินหรือข้อโต้แย้ง",
    keepNoAutoBody:
      "ระบบไม่มีการลบข้อมูลอัตโนมัติตามกำหนดเวลา ข้อมูลจะถูกลบเมื่อผู้จัดสั่งลบ — ผู้จัดล้างใบสมัครและไฟล์สลิปของงานที่จบแล้วออกจากระบบได้ ถ้าต้องการให้ลบข้อมูลของคุณ โปรดแจ้งผู้จัด",
    keepRecordBody:
      "ผลการแข่งขันและรางวัลที่บันทึกเข้าฐานข้อมูลของสมาคมแล้ว เป็นบันทึกผลการแข่งขันที่คงอยู่ต่อไป และระบบนี้ลบให้ไม่ได้",

    rightsTitle: "สิทธิของคุณ",
    rightsIntro:
      "พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA) ให้สิทธิคุณดังนี้",
    rightAccessTerm: "ขอดูและขอสำเนาข้อมูล",
    rightAccessBody:
      "ดูข้อมูลของตัวเองในแอปได้ที่หน้าโปรไฟล์ ผู้เล่นในกำกับ และสถานะการสมัคร · ถ้าต้องการสำเนาข้อมูลทั้งหมดที่ระบบเก็บไว้ ต้องขอกับผู้จัด แอปยังไม่มีปุ่มดาวน์โหลดข้อมูล",
    rightRectifyTerm: "ขอแก้ไขข้อมูลให้ถูกต้อง",
    rightRectifyBody:
      "แก้ชื่อ เบอร์โทร วันเกิด จังหวัด และสถาบันได้เองที่หน้าโปรไฟล์และหน้าผู้เล่นในกำกับ · ข้อมูลบนใบสมัครที่ยืนยันแล้ว และระดับฝีมือที่มาจากฐานข้อมูลของสมาคม ต้องแจ้งผู้จัดให้แก้ให้",
    rightEraseTerm: "ขอลบข้อมูล",
    rightEraseBody:
      "แอปยังไม่มีปุ่มลบบัญชีหรือลบข้อมูลด้วยตัวเอง ต้องแจ้งผู้จัดเพื่อให้ลบให้ · ข้อมูลบางส่วนอาจต้องเก็บต่อเท่าที่จำเป็นต่อการตรวจสอบยอดเงิน หรือเท่าที่กฎหมายกำหนด",
    rightWithdrawTerm: "ขอถอนความยินยอม",
    rightWithdrawBody:
      "ถอนได้ทุกเมื่อโดยแจ้งผู้จัด · ข้อมูลเหล่านี้จำเป็นต่อการจัดการแข่งขัน การถอนความยินยอมจึงมีผลเท่ากับถอนตัวจากรายการที่สมัครไว้ ส่วนการคืนค่าสมัครเป็นดุลยพินิจของผู้จัดตามเงื่อนไขการถอนตัว",
    rightComplainTerm: "ขอร้องเรียน",
    rightComplainBody:
      "ถ้าเห็นว่าข้อมูลถูกใช้ไม่ถูกต้อง ร้องเรียนกับผู้จัดได้โดยตรง และร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล (สคส.) ได้",
    rightsContactNote: "คำขอทุกข้อ ส่งที่ช่องทางติดต่อของผู้จัดด้านบนของหน้านี้",

    securityTitle: "การดูแลรักษาข้อมูล",
    securityBody:
      "ไฟล์สลิปเก็บในที่จัดเก็บแบบปิด เปิดดูได้เฉพาะผ่านลิงก์ชั่วคราวที่ระบบสร้างให้ผู้ดูแลระบบ · ผู้ใช้คนอื่นอ่านข้อมูลโปรไฟล์และผู้เล่นในกำกับของคุณไม่ได้ ระบบเปิดให้เฉพาะเจ้าของบัญชีและผู้ดูแลระบบของรายการแข่งขัน · หน้าและคำสั่งฝั่งหลังบ้านต้องเข้าสู่ระบบด้วยบัญชีที่มีสิทธิ์ผู้ดูแลระบบ",

    changesTitle: "การแก้ไขประกาศนี้",
    changesBody:
      "ถ้าระบบเก็บหรือใช้ข้อมูลต่างไปจากที่เขียนไว้ ประกาศนี้จะถูกแก้ก่อน และวันที่ปรับปรุงล่าสุดด้านบนจะเปลี่ยนตาม",
  },
};

export type Dictionary = typeof th;
