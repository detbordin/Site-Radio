// ระบบหลายภาษา (พื้นฐาน): ไทย / อังกฤษ / จีน / เขมร / พม่า / ลาว
// ครอบคลุมข้อความหลักของหน้าจอ (ปุ่ม/ป้ายกำกับ/หัวข้อ) - ข้อความแจ้งเตือน (toast) ยังเป็นภาษาไทยเป็นหลัก
const I18N = (() => {
  const LANGS = ['th', 'en', 'zh', 'km', 'my', 'lo'];
  const LANG_NAMES = { th: 'ไทย', en: 'English', zh: '中文', km: 'ខ្មែរ', my: 'မြန်မာ', lo: 'ລາວ' };
  const SPEECH_LANG = { th: 'th-TH', en: 'en-US', zh: 'zh-CN', km: 'km-KH', my: 'my-MM', lo: 'lo-LA' };

  const dict = {
    th: {
      app_title: 'วิทยุไซต์งาน', name_sub: 'ตั้งชื่อของคุณเพื่อเริ่มใช้งาน',
      name_placeholder: 'ชื่อที่จะให้คนอื่นเห็น เช่น ช่าง A', btn_start: 'เริ่มใช้งาน',
      groups_title: 'กลุ่มของฉัน', my_profile_title: 'ชื่อของฉัน', lang_title: 'ภาษา',
      chat_tab: 'แชท', members_tab: 'สมาชิก', radio_tab: 'วิทยุ',
      chat_placeholder: 'พิมพ์ข้อความ...', mic_title: 'พูดแล้วพิมพ์อัตโนมัติ',
      ping_group_btn: '🔔 กดแจ้งเตือนทั้งกลุ่ม (ทุกเครื่องจะได้ยินเสียง)', ptt_label: 'แตะเพื่อพูด',
      radio_connecting: 'กำลังเชื่อมต่อวิทยุ...', dm_placeholder: 'พิมพ์ข้อความส่วนตัว...',
      dm_default_title: 'ข้อความส่วนตัว', ping_dm_title: 'เรียกเตือน',
      modal_create_title: 'สร้างกลุ่มใหม่', create_name_placeholder: 'ชื่อกลุ่ม เช่น ไซต์งานพระราม 9',
      create_pass_placeholder: 'ตั้งรหัสผ่านกลุ่ม', btn_cancel: 'ยกเลิก', btn_create: 'สร้างกลุ่ม',
      modal_qr_title: 'เชิญเข้าร่วมกลุ่ม',
      qr_sub: 'ให้เพื่อนร่วมทีมเปิดกล้อง/สแกน QR นี้ เพื่อเข้ากลุ่มได้ทันที ไม่ต้องพิมพ์รหัส',
      btn_close: 'ปิด', btn_copy_link: 'คัดลอกลิงก์เชิญ', modal_join_title: 'เข้าร่วมกลุ่ม',
      join_code_placeholder: 'รหัสกลุ่ม (6 หลัก)', join_pass_placeholder: 'รหัสผ่านกลุ่ม', btn_join: 'เข้าร่วม',
      incoming_sub: 'วิดีโอคอล', btn_decline: 'ปฏิเสธ', btn_accept: 'รับสาย', video_connecting: 'กำลังเชื่อมต่อ...',
      unmute_hint: '🔊 แตะเพื่อเปิดเสียง', profile_title: 'โปรไฟล์ของฉัน',
      profile_sub_default: 'ชื่อ/รูปนี้จะใช้เป็นค่าเริ่มต้นกับทุกกลุ่มที่เข้าร่วม',
      profile_title_group: 'แก้ไขโปรไฟล์ในกลุ่มนี้', profile_sub_group: 'ชื่อ/รูปนี้จะใช้เฉพาะในกลุ่ม "{group}" เท่านั้น',
      profile_name_placeholder: 'ชื่อที่จะให้คนอื่นเห็น', btn_pick_photo: '📷 อัปโหลดรูปตัวเอง',
      profile_icon_hint: 'หรือเลือกไอคอนคน/สัตว์น่ารัก', cat_people: '🧑 คน', cat_animals: '🐾 สัตว์',
      btn_save: 'บันทึก', lang_picker_title: 'เลือกภาษา', online_label: '🟢 ออนไลน์', offline_label: '🔴 ออฟไลน์',
      role_admin: 'แอดมิน', role_member: 'สมาชิก', status_online: 'ออนไลน์', status_offline: 'ออฟไลน์',
      empty_groups_hint: 'ยังไม่มีกลุ่ม แตะปุ่ม + ด้านล่างเพื่อสร้างกลุ่มใหม่ หรือเข้าร่วมด้วยรหัสที่ได้รับ',
      ptt_target_all: '📢 ทั้งกลุ่ม', code_label: 'รหัส', label_all_group: 'ทั้งกลุ่ม', ptt_who_title: 'วิทยุหาใคร?', radio_waiting: 'รอเพื่อนร่วมทีมออนไลน์...', radio_connected_count: 'เชื่อมต่อวิทยุกับ {n} คน',
      update_app_title: 'ตรวจสอบและอัปเดตเวอร์ชันล่าสุด'
    },
    en: {
      app_title: 'Site Radio', name_sub: 'Set your name to get started',
      name_placeholder: 'Name others will see, e.g. Worker A', btn_start: 'Get Started',
      groups_title: 'My Groups', my_profile_title: 'My Profile', lang_title: 'Language',
      chat_tab: 'Chat', members_tab: 'Members', radio_tab: 'Radio',
      chat_placeholder: 'Type a message...', mic_title: 'Speak to type',
      ping_group_btn: '🔔 Alert whole group (every device will hear it)', ptt_label: 'Tap to talk',
      radio_connecting: 'Connecting radio...', dm_placeholder: 'Type a private message...',
      dm_default_title: 'Private message', ping_dm_title: 'Alert',
      modal_create_title: 'Create new group', create_name_placeholder: 'Group name, e.g. Rama 9 Site',
      create_pass_placeholder: 'Set group password', btn_cancel: 'Cancel', btn_create: 'Create group',
      modal_qr_title: 'Invite to group',
      qr_sub: 'Have your teammate open their camera / scan this QR to join instantly, no code needed',
      btn_close: 'Close', btn_copy_link: 'Copy invite link', modal_join_title: 'Join a group',
      join_code_placeholder: 'Group code (6 digits)', join_pass_placeholder: 'Group password', btn_join: 'Join',
      incoming_sub: 'Video call', btn_decline: 'Decline', btn_accept: 'Accept', video_connecting: 'Connecting...',
      unmute_hint: '🔊 Tap to unmute', profile_title: 'My Profile',
      profile_sub_default: 'This name/photo will be the default for every group you join',
      profile_title_group: 'Edit profile in this group', profile_sub_group: 'This name/photo will only apply in "{group}"',
      profile_name_placeholder: 'Name others will see', btn_pick_photo: '📷 Upload your photo',
      profile_icon_hint: 'Or pick a cute person/animal icon', cat_people: '🧑 People', cat_animals: '🐾 Animals',
      btn_save: 'Save', lang_picker_title: 'Choose language', online_label: '🟢 Online', offline_label: '🔴 Offline',
      role_admin: 'Admin', role_member: 'Member', status_online: 'Online', status_offline: 'Offline',
      empty_groups_hint: 'No groups yet. Tap + below to create one, or join with a code.',
      ptt_target_all: '📢 Whole group', code_label: 'Code', label_all_group: 'Whole group', ptt_who_title: 'Talk to whom?', radio_waiting: 'Waiting for teammates to come online...', radio_connected_count: 'Connected to {n} people',
      update_app_title: 'Check for and install the latest update'
    },
    zh: {
      app_title: '工地对讲机', name_sub: '设置您的名字以开始使用',
      name_placeholder: '让别人看到的名字，例如 工人A', btn_start: '开始使用',
      groups_title: '我的群组', my_profile_title: '我的资料', lang_title: '语言',
      chat_tab: '聊天', members_tab: '成员', radio_tab: '对讲',
      chat_placeholder: '输入消息...', mic_title: '语音输入',
      ping_group_btn: '🔔 提醒全群（所有设备都会响）', ptt_label: '点击说话',
      radio_connecting: '正在连接对讲...', dm_placeholder: '输入私信...',
      dm_default_title: '私信', ping_dm_title: '提醒',
      modal_create_title: '创建新群组', create_name_placeholder: '群组名称，例如 拉玛九工地',
      create_pass_placeholder: '设置群组密码', btn_cancel: '取消', btn_create: '创建群组',
      modal_qr_title: '邀请加入群组',
      qr_sub: '让队友打开相机/扫描此二维码即可立即加入，无需输入密码',
      btn_close: '关闭', btn_copy_link: '复制邀请链接', modal_join_title: '加入群组',
      join_code_placeholder: '群组代码（6位）', join_pass_placeholder: '群组密码', btn_join: '加入',
      incoming_sub: '视频通话', btn_decline: '拒绝', btn_accept: '接听', video_connecting: '正在连接...',
      unmute_hint: '🔊 点击开启声音', profile_title: '我的资料',
      profile_sub_default: '此名字/照片将作为您加入所有群组的默认资料',
      profile_title_group: '编辑此群组的资料', profile_sub_group: '此名字/照片仅适用于群组「{group}」',
      profile_name_placeholder: '让别人看到的名字', btn_pick_photo: '📷 上传照片',
      profile_icon_hint: '或选择可爱的人物/动物图标', cat_people: '🧑 人物', cat_animals: '🐾 动物',
      btn_save: '保存', lang_picker_title: '选择语言', online_label: '🟢 在线', offline_label: '🔴 离线',
      role_admin: '管理员', role_member: '成员', status_online: '在线', status_offline: '离线',
      empty_groups_hint: '还没有群组。点击下方 + 创建新群组，或使用代码加入。',
      ptt_target_all: '📢 全群', code_label: '代码', label_all_group: '全群', ptt_who_title: '对讲给谁？', radio_waiting: '正在等待队友上线...', radio_connected_count: '已连接 {n} 人',
      update_app_title: '检查并更新到最新版本'
    },
    km: {
      app_title: 'វិទ្យុការដ្ឋាន', name_sub: 'កំណត់ឈ្មោះរបស់អ្នកដើម្បីចាប់ផ្តើម',
      name_placeholder: 'ឈ្មោះដែលអ្នកដទៃនឹងឃើញ ឧទាហរណ៍ ជាង A', btn_start: 'ចាប់ផ្តើមប្រើ',
      groups_title: 'ក្រុមរបស់ខ្ញុំ', my_profile_title: 'ប្រវត្តិរូបរបស់ខ្ញុំ', lang_title: 'ភាសា',
      chat_tab: 'ជជែក', members_tab: 'សមាជិក', radio_tab: 'វិទ្យុ',
      chat_placeholder: 'វាយសារ...', mic_title: 'និយាយដើម្បីវាយអក្សរ',
      ping_group_btn: '🔔 ជូនដំណឹងដល់ក្រុមទាំងអស់ (គ្រប់ឧបករណ៍នឹងឮ)', ptt_label: 'ចុចដើម្បីនិយាយ',
      radio_connecting: 'កំពុងភ្ជាប់វិទ្យុ...', dm_placeholder: 'វាយសារឯកជន...',
      dm_default_title: 'សារឯកជន', ping_dm_title: 'ជូនដំណឹង',
      modal_create_title: 'បង្កើតក្រុមថ្មី', create_name_placeholder: 'ឈ្មោះក្រុម ឧទាហរណ៍ ការដ្ឋាន Rama 9',
      create_pass_placeholder: 'កំណត់លេខសម្ងាត់ក្រុម', btn_cancel: 'បោះបង់', btn_create: 'បង្កើតក្រុម',
      modal_qr_title: 'អញ្ជើញចូលរួមក្រុម',
      qr_sub: 'ឱ្យសមាជិកក្រុមបើកកាមេរ៉ា/ស្កេន QR នេះ ដើម្បីចូលរួមភ្លាមៗ ដោយមិនចាំបាច់វាយលេខសម្ងាត់',
      btn_close: 'បិទ', btn_copy_link: 'ចម្លងតំណអញ្ជើញ', modal_join_title: 'ចូលរួមក្រុម',
      join_code_placeholder: 'លេខកូដក្រុម (៦ខ្ទង់)', join_pass_placeholder: 'លេខសម្ងាត់ក្រុម', btn_join: 'ចូលរួម',
      incoming_sub: 'ការហៅវីដេអូ', btn_decline: 'បដិសេធ', btn_accept: 'ទទួលហៅ', video_connecting: 'កំពុងភ្ជាប់...',
      unmute_hint: '🔊 ចុចដើម្បីបើកសំឡេង', profile_title: 'ប្រវត្តិរូបរបស់ខ្ញុំ',
      profile_sub_default: 'ឈ្មោះ/រូបនេះនឹងប្រើជាលំនាំដើមសម្រាប់គ្រប់ក្រុមដែលអ្នកចូលរួម',
      profile_title_group: 'កែប្រែប្រវត្តិរូបក្នុងក្រុមនេះ', profile_sub_group: 'ឈ្មោះ/រូបនេះនឹងប្រើតែក្នុងក្រុម "{group}" ប៉ុណ្ណោះ',
      profile_name_placeholder: 'ឈ្មោះដែលអ្នកដទៃនឹងឃើញ', btn_pick_photo: '📷 ផ្ទុករូបភាពរបស់អ្នក',
      profile_icon_hint: 'ឬជ្រើសរើសរូបតំណាងមនុស្ស/សត្វគួរឱ្យស្រលាញ់', cat_people: '🧑 មនុស្ស', cat_animals: '🐾 សត្វ',
      btn_save: 'រក្សាទុក', lang_picker_title: 'ជ្រើសរើសភាសា', online_label: '🟢 អនឡាញ', offline_label: '🔴 គ្មានអនឡាញ',
      role_admin: 'អ្នកគ្រប់គ្រង', role_member: 'សមាជិក', status_online: 'អនឡាញ', status_offline: 'គ្មានអនឡាញ',
      empty_groups_hint: 'មិនទាន់មានក្រុមទេ។ ចុចប៊ូតុង + ខាងក្រោមដើម្បីបង្កើតក្រុមថ្មី ឬចូលរួមដោយប្រើលេខកូដ។',
      ptt_target_all: '📢 ក្រុមទាំងអស់', code_label: 'កូដ', label_all_group: 'ក្រុមទាំងអស់', ptt_who_title: 'និយាយទៅកាន់អ្នកណា?', radio_waiting: 'កំពុងរង់ចាំសមាជិកក្រុមចូលអនឡាញ...', radio_connected_count: 'បានភ្ជាប់ជាមួយ {n} នាក់',
      update_app_title: 'ពិនិត្យ និងអាប់ដេតទៅជាកំណែថ្មីបំផុត'
    },
    my: {
      app_title: 'ဆိုက်ရေဒီယို', name_sub: 'အသုံးပြုရန် သင့်အမည်ကို သတ်မှတ်ပါ',
      name_placeholder: 'အခြားသူများမြင်ရမည့်အမည် ဥပမာ- အလုပ်သမား A', btn_start: 'စတင်အသုံးပြုမည်',
      groups_title: 'ကျွန်ုပ်၏အုပ်စုများ', my_profile_title: 'ကျွန်ုပ်၏ပရိုဖိုင်', lang_title: 'ဘာသာစကား',
      chat_tab: 'စကားပြော', members_tab: 'အဖွဲ့ဝင်များ', radio_tab: 'ရေဒီယို',
      chat_placeholder: 'မက်ဆေ့ချ်ရိုက်ပါ...', mic_title: 'ပြောပြီး အလိုအလျောက်စာရိုက်ရန်',
      ping_group_btn: '🔔 အုပ်စုတစ်ခုလုံးကို သတိပေးမည် (စက်အားလုံးကြားရမည်)', ptt_label: 'ပြောရန် နှိပ်ပါ',
      radio_connecting: 'ရေဒီယိုချိတ်ဆက်နေသည်...', dm_placeholder: 'ကိုယ်ပိုင်မက်ဆေ့ချ်ရိုက်ပါ...',
      dm_default_title: 'ကိုယ်ပိုင်မက်ဆေ့ချ်', ping_dm_title: 'သတိပေးရန်',
      modal_create_title: 'အုပ်စုအသစ်ဖန်တီးရန်', create_name_placeholder: 'အုပ်စု အမည် ဥပမာ- Rama 9 ဆိုက်',
      create_pass_placeholder: 'အုပ်စု စကားဝှက် သတ်မှတ်ပါ', btn_cancel: 'ပယ်ဖျက်', btn_create: 'အုပ်စုဖန်တီးမည်',
      modal_qr_title: 'အုပ်စုသို့ ဖိတ်ခေါ်ရန်',
      qr_sub: 'အဖွဲ့ဝင်များ ကင်မရာဖွင့်၍ ဒီ QR ကို စကင်ဖတ်ပါက ချက်ချင်း ဝင်ရောက်နိုင်သည် စကားဝှက်ရိုက်စရာမလို',
      btn_close: 'ပိတ်', btn_copy_link: 'ဖိတ်ခေါ်လင့်ခ်ကူးမည်', modal_join_title: 'အုပ်စုသို့ ဝင်ရောက်ရန်',
      join_code_placeholder: 'အုပ်စု ကုဒ် (၆ လုံး)', join_pass_placeholder: 'အုပ်စု စကားဝှက်', btn_join: 'ဝင်ရောက်မည်',
      incoming_sub: 'ဗီဒီယိုခေါ်ဆိုမှု', btn_decline: 'ငြင်းပယ်', btn_accept: 'လက်ခံမည်', video_connecting: 'ချိတ်ဆက်နေသည်...',
      unmute_hint: '🔊 အသံဖွင့်ရန် နှိပ်ပါ', profile_title: 'ကျွန်ုပ်၏ပရိုဖိုင်',
      profile_sub_default: 'ဒီအမည်/ပုံသည် ဝင်ရောက်သည့်အုပ်စုအားလုံးအတွက် မူလတန်ဖိုးဖြစ်လိမ့်မည်',
      profile_title_group: 'ဒီအုပ်စု၏ ပရိုဖိုင်ကို ပြင်ရန်', profile_sub_group: 'ဒီအမည်/ပုံသည် "{group}" အုပ်စုတွင်သာ သက်ရောက်မည်',
      profile_name_placeholder: 'အခြားသူများမြင်ရမည့်အမည်', btn_pick_photo: '📷 ကိုယ်ပိုင်ဓာတ်ပုံတင်ရန်',
      profile_icon_hint: 'သို့မဟုတ် ချစ်ဖွယ် လူ/တိရစ္ဆာန် အိုင်ကွန်ရွေးပါ', cat_people: '🧑 လူ', cat_animals: '🐾 တိရစ္ဆာန်',
      btn_save: 'သိမ်းမည်', lang_picker_title: 'ဘာသာစကားရွေးပါ', online_label: '🟢 အွန်လိုင်း', offline_label: '🔴 အော့ဖ်လိုင်း',
      role_admin: 'အက်ဒမင်', role_member: 'အဖွဲ့ဝင်', status_online: 'အွန်လိုင်း', status_offline: 'အော့ဖ်လိုင်း',
      empty_groups_hint: 'အုပ်စုမရှိသေးပါ။ အောက်ပါ + ကိုနှိပ်ပြီး အုပ်စုအသစ်ဖန်တီးပါ (သို့) ကုဒ်နှင့် ဝင်ရောက်ပါ။',
      ptt_target_all: '📢 အုပ်စုတစ်ခုလုံး', code_label: 'ကုဒ်', label_all_group: 'အုပ်စုတစ်ခုလုံး', ptt_who_title: 'ဘယ်သူ့ကိုပြောမလဲ?', radio_waiting: 'အဖွဲ့ဝင်များ အွန်လိုင်းလာရန် စောင့်နေသည်...', radio_connected_count: 'လူ {n} ဦးနှင့် ချိတ်ဆက်ထားသည်',
      update_app_title: 'နောက်ဆုံးဗားရှင်းအသစ်ကို စစ်ဆေးပြီး အပ်ဒိတ်လုပ်ရန်'
    },
    lo: {
      app_title: 'ວິທະຍຸໄຊງານ', name_sub: 'ຕັ້ງຊື່ຂອງທ່ານເພື່ອເລີ່ມໃຊ້ງານ',
      name_placeholder: 'ຊື່ທີ່ຄົນອື່ນຈະເຫັນ ເຊັ່ນ ຊ່າງ A', btn_start: 'ເລີ່ມໃຊ້ງານ',
      groups_title: 'ກຸ່ມຂອງຂ້ອຍ', my_profile_title: 'ໂປຣໄຟລ໌ຂອງຂ້ອຍ', lang_title: 'ພາສາ',
      chat_tab: 'ແຊັດ', members_tab: 'ສະມາຊິກ', radio_tab: 'ວິທະຍຸ',
      chat_placeholder: 'ພິມຂໍ້ຄວາມ...', mic_title: 'ເວົ້າແລ້ວພິມອັດຕະໂນມັດ',
      ping_group_btn: '🔔 ແຈ້ງເຕືອນທັງກຸ່ມ (ທຸກເຄື່ອງຈະໄດ້ຍິນ)', ptt_label: 'ແຕະເພື່ອເວົ້າ',
      radio_connecting: 'ກຳລັງເຊື່ອມຕໍ່ວິທະຍຸ...', dm_placeholder: 'ພິມຂໍ້ຄວາມສ່ວນຕົວ...',
      dm_default_title: 'ຂໍ້ຄວາມສ່ວນຕົວ', ping_dm_title: 'ແຈ້ງເຕືອນ',
      modal_create_title: 'ສ້າງກຸ່ມໃໝ່', create_name_placeholder: 'ຊື່ກຸ່ມ ເຊັ່ນ ໄຊງານພຣະລາມ 9',
      create_pass_placeholder: 'ຕັ້ງລະຫັດຜ່ານກຸ່ມ', btn_cancel: 'ຍົກເລີກ', btn_create: 'ສ້າງກຸ່ມ',
      modal_qr_title: 'ເຊີນເຂົ້າຮ່ວມກຸ່ມ',
      qr_sub: 'ໃຫ້ໝູ່ຮ່ວມທີມເປີດກ້ອງ/ສະແກນ QR ນີ້ ເພື່ອເຂົ້າກຸ່ມທັນທີ ບໍ່ຕ້ອງພິມລະຫັດ',
      btn_close: 'ປິດ', btn_copy_link: 'ຄັດລອກລິ້ງເຊີນ', modal_join_title: 'ເຂົ້າຮ່ວມກຸ່ມ',
      join_code_placeholder: 'ລະຫັດກຸ່ມ (6 ຫຼັກ)', join_pass_placeholder: 'ລະຫັດຜ່ານກຸ່ມ', btn_join: 'ເຂົ້າຮ່ວມ',
      incoming_sub: 'ວິດີໂອຄອນ', btn_decline: 'ປະຕິເສດ', btn_accept: 'ຮັບສາຍ', video_connecting: 'ກຳລັງເຊື່ອມຕໍ່...',
      unmute_hint: '🔊 ແຕະເພື່ອເປີດສຽງ', profile_title: 'ໂປຣໄຟລ໌ຂອງຂ້ອຍ',
      profile_sub_default: 'ຊື່/ຮູບນີ້ຈະໃຊ້ເປັນຄ່າເລີ່ມຕົ້ນກັບທຸກກຸ່ມທີ່ເຂົ້າຮ່ວມ',
      profile_title_group: 'ແກ້ໄຂໂປຣໄຟລ໌ໃນກຸ່ມນີ້', profile_sub_group: 'ຊື່/ຮູບນີ້ຈະໃຊ້ສະເພາະໃນກຸ່ມ "{group}" ເທົ່ານັ້ນ',
      profile_name_placeholder: 'ຊື່ທີ່ຄົນອື່ນຈະເຫັນ', btn_pick_photo: '📷 ອັບໂຫລດຮູບຕົນເອງ',
      profile_icon_hint: 'ຫຼືເລືອກໄອຄອນຄົນ/ສັດໜ້າຮັກ', cat_people: '🧑 ຄົນ', cat_animals: '🐾 ສັດ',
      btn_save: 'ບັນທຶກ', lang_picker_title: 'ເລືອກພາສາ', online_label: '🟢 ອອນລາຍ', offline_label: '🔴 ອອບລາຍ',
      role_admin: 'ແອັດມິນ', role_member: 'ສະມາຊິກ', status_online: 'ອອນລາຍ', status_offline: 'ອອບລາຍ',
      empty_groups_hint: 'ຍັງບໍ່ມີກຸ່ມ. ກົດປຸ່ມ + ດ້ານລຸ່ມເພື່ອສ້າງກຸ່ມໃໝ່ ຫຼືເຂົ້າຮ່ວມດ້ວຍລະຫັດ.',
      ptt_target_all: '📢 ທັງກຸ່ມ', code_label: 'ລະຫັດ', label_all_group: 'ທັງກຸ່ມ', ptt_who_title: 'ວິທະຍຸຫາໃຜ?', radio_waiting: 'ກຳລັງລໍຖ້າໝູ່ຮ່ວມທີມອອນລາຍ...', radio_connected_count: 'ເຊື່ອມຕໍ່ກັບ {n} ຄົນແລ້ວ',
      update_app_title: 'ກວດສອບ ແລະ ອັບເດດເປັນເວີຊັນລ່າສຸດ'
    }
  };

  let current = (() => {
    try {
      const saved = localStorage.getItem('sr_lang');
      return LANGS.includes(saved) ? saved : 'th';
    } catch (e) { return 'th'; }
  })();

  function t(key, vars) {
    const table = dict[current] || dict.th;
    let s = table[key] || dict.th[key] || key;
    if (vars) Object.keys(vars).forEach(k => { s = s.replace(`{${k}}`, vars[k]); });
    return s;
  }
  function getLang() { return current; }
  function getLangName(l) { return LANG_NAMES[l] || l; }
  function speechLang() { return SPEECH_LANG[current] || 'th-TH'; }
  function setLang(l) {
    if (!LANGS.includes(l)) return;
    current = l;
    try { localStorage.setItem('sr_lang', l); } catch (e) {}
    applyStaticTranslations();
  }
  function applyStaticTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(elx => {
      elx.textContent = t(elx.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(elx => {
      elx.placeholder = t(elx.getAttribute('data-i18n-placeholder'));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(elx => {
      elx.title = t(elx.getAttribute('data-i18n-title'));
    });
    document.documentElement.lang = current;
  }

  return { LANGS, t, getLang, getLangName, setLang, speechLang, applyStaticTranslations };
})();
