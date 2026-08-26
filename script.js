"use strict";

// Supabase projenizi oluşturduktan sonra yalnızca bu iki değeri değiştirin.
// Publishable key tarayıcıda kullanılmak üzere tasarlanmıştır; secret/service_role key kullanmayın.
const CLOUD_CONFIG = {
  url: "https://mhnkaqwjscsvlfxrbtfb.supabase.co",
  publishableKey: "sb_publishable_TWPHV11M9FjmuSCs6AZ1Qg_Z5Nh80By"
};

const isCloudConfigured = Boolean(
  CLOUD_CONFIG.url.startsWith("https://") &&
  !CLOUD_CONFIG.url.includes("YOUR_PROJECT") &&
  CLOUD_CONFIG.publishableKey &&
  !CLOUD_CONFIG.publishableKey.includes("YOUR_SUPABASE")
);

const cloudClient = isCloudConfigured && window.supabase
  ? window.supabase.createClient(CLOUD_CONFIG.url, CLOUD_CONFIG.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    })
  : null;

let cloudSession = null;
let cloudSyncTimer = null;
let studentPreviewMode = false;
let previewStudentRecord = null;
let readingTargetDateKey = null;
let teacherStore = { classes: [], students: [], activeClassId: null, selectedStudentId: null, reportWeekKey: null };
let teacherPanelView = "dashboard";
let onboardingStep = 0;

const STORAGE_KEYS = {
  settings: "vdca_settings",
  answers: "vdca_module_answers",
  checks: "vdca_module_checks",
  completed: "vdca_module_completed",
  plan: "vdca_weekly_plan",
  planHistory: "vdca_weekly_plan_history",
  planWeekKey: "vdca_weekly_plan_week",
  quizzes: "vdca_module_quizzes",
  activities: "vdca_module_activities",
  attendance: "vdca_daily_attendance",
  readingLog: "vdca_daily_reading_log",
  workshop: "vdca_private_workshop_progress",
  modules: "vdca_module_catalog",
  onboarding: "vdca_student_onboarding_done",
  cloudSession: "vdca_cloud_session"
};

const DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const PREVIEW_BLOCKED_ACTIONS = new Set([
  "quiz-option", "activity-choice", "activity-confidence", "activity-day",
  "save-activity-reflection", "select-reading-day", "visit-reading-workshop", "complete-daily-reading", "save-draft", "add-plan-task", "remove-plan-task",
  "clear-plan", "select-theme", "download-student-backup", "reset-data",
  "start-workshop", "workshop-quiz-option", "save-workshop-draft", "complete-workshop-module"
]);

const TEACHER_TIPS = [
  "Her gün aynı saatte çalışmak alışkanlık kazandırır.",
  "Telefonu masadan uzaklaştırmak odaklanmayı kolaylaştırır.",
  "Yanlışlarını silme; onları incele ve sana ne anlattıklarını bul.",
  "Kısa tekrarlar bilgiyi kalıcı hâle getirir.",
  "Planını çok zor yaparsan uygulamak istemeyebilirsin. Küçük başla.",
  "Deneme sınavı sonucu sadece puan değildir, bir yol haritasıdır.",
  "Önce küçük hedef koy, sonra adım adım büyüt.",
  "Çalışırken tek işe odaklan. Bir işi bitirince diğerine geç."
];

const MODULES = [
  {
    id: 1,
    icon: "🗓️",
    title: "Nasıl Plan Yapılır?",
    short: "Gerçekçi ve uygulanabilir bir haftalık çalışma planı oluştur.",
    description: "Plan yapmak, neye ne zaman çalışacağını bilmeni sağlar. Plansız çalışan bir öğrenci çoğu zaman nereden başlayacağını bilemez. İyi bir plan seni yormaz; sana yol gösterir. Planında ders kadar dinlenmeye de yer vermen önemlidir.",
    goal: "Bu modülün sonunda haftalık ders çalışma planı hazırlamayı öğreneceksin.",
    lesson: [
      ["🎯", "Önceliğini bul", "Önce en çok gelişmek istediğin dersi seç."],
      ["⏱️", "Süreyi küçük tut", "Uygulayabileceğin süreler belirle. 25 dakika iyi bir başlangıç olabilir."],
      ["🌿", "Dinlenmeyi unutma", "Kısa molalar zihninin yeniden güç toplamasını sağlar."]
    ],
    story: "Ece, bütün derslere aynı gün çalışmaya karar verdi. Bir süre sonra yoruldu ve planını bıraktı. Ertesi hafta her güne yalnızca iki küçük görev yazdı. Bu kez planını uygulamak daha kolay oldu.",
    task: "Kendi haftalık ders planının ilk taslağını hazırla. Cevapların kısa olabilir; önemli olan planının sana uygun olması.",
    fields: [
      ["priorityLesson", "Bu hafta en çok hangi derse çalışmalıyım?", "text", "Örnek: Türkçe"],
      ["topics", "Bu hafta hangi konulara odaklanacağım?", "textarea", "Örnek: Paragrafta ana fikir ve yardımcı fikir"],
      ["dailyMinutes", "Günde kaç dakika çalışacağım?", "number", "Örnek: 30"],
      ["studyDays", "Hangi günler çalışacağım?", "text", "Örnek: Pazartesi, Çarşamba ve Cumartesi"],
      ["hardestDay", "En zorlanacağım gün hangisi?", "text", "Örnek: Salı"],
      ["promise", "Planımı uygulamak için kendime vereceğim küçük söz nedir?", "textarea", "Örnek: Başlamak istemesem bile ilk 10 dakikayı deneyeceğim."]
    ],
    checks: ["Çalışacağım dersleri yazdım.", "Zorlandığım konuları belirledim.", "Günlük çalışma süremi seçtim.", "Dinlenme zamanımı ekledim.", "Planımı gerçekçi yaptım."]
  },
  {
    id: 2,
    icon: "🛡️",
    title: "Dikkat Dağıtıcılarla Nasıl Baş Edilir?",
    short: "Odaklanmanı zorlaştıran şeyleri fark et ve etkilerini azalt.",
    description: "Telefon, bildirimler, gürültü ve dağınık masa odaklanmayı zorlaştırabilir. Dikkat dağıtıcıları tamamen yok etmek her zaman mümkün değildir. Fakat onları azaltmak mümkündür. Önceden alacağın küçük önlemler çalışmaya daha kolay başlamanı sağlar.",
    goal: "Bu modülün sonunda kendi dikkat koruma planını oluşturabileceksin.",
    lesson: [
      ["👀", "Dikkatini gözle", "Dikkatinin ne zaman ve neden dağıldığını fark et."],
      ["📵", "Uzağa koy", "Telefonu sessize almak yetmeyebilir. Görüş alanından da çıkar."],
      ["🧹", "Alanını sadeleştir", "Masanda yalnızca o ders için gerekli malzemeler bulunsun."]
    ],
    story: "Mert, ders çalışırken gelen her bildirime bakıyordu. Telefonunu başka odaya bırakıp 20 dakikalık bir sayaç kurdu. Süre bitince bildirimlerini kontrol etti. Böylece hem merakı azaldı hem çalışmasını tamamladı.",
    task: "Seni en çok etkileyen dikkat dağıtıcıları belirle ve bugün kullanacağın bir önlem seç.",
    fields: [
      ["mainDistractor", "Ders çalışırken dikkatimi en çok ne dağıtıyor?", "textarea", "Telefon, sesler, düşünceler..."],
      ["phonePlace", "Telefonu nereye koyabilirim?", "text", "Örnek: Salondaki çekmeceye"],
      ["deskItems", "Çalışma masamda olmaması gereken şeyler neler?", "textarea", "Örnek: Oyun konsolu ve gereksiz kâğıtlar"],
      ["noisePlan", "Gürültü varsa ne yapabilirim?", "textarea", "Kullanabileceğin sakin bir çözüm yaz."],
      ["todayAction", "Bugün dikkatimi korumak için hangi önlemi alacağım?", "textarea", "Tek ve uygulanabilir bir önlem seç."]
    ],
    checks: ["Telefonumu görüş alanımdan çıkaracağım.", "Masamda sadece gerekli malzemeleri bırakacağım.", "Bildirimleri kapatacağım.", "Kısa süreli çalışma hedefi seçeceğim."]
  },
  {
    id: 3,
    icon: "🔁",
    title: "Etkili Tekrar Nasıl Yapılır?",
    short: "Unutmayı azaltan kısa ve aralıklı tekrar düzeni kur.",
    description: "Bir konuyu bir kez çalışmak çoğu zaman yeterli olmaz. Bilginin kalıcı olması için belirli aralıklarla tekrar yapmak gerekir. Etkili tekrar uzun olmak zorunda değildir. Kısa özetler, sorular ve küçük testler unutmayı azaltır.",
    goal: "Bu modülün sonunda üç günlük bir tekrar planı hazırlayabileceksin.",
    lesson: [
      ["📝", "Kısaca özetle", "Konuyu kendi cümlelerinle birkaç satırda anlat."],
      ["📆", "Aralıklı dön", "Aynı konuya ertesi gün, üç gün sonra ve bir hafta sonra bak."],
      ["❓", "Kendini sına", "Sadece okumak yerine sorulara cevap vermeyi dene."]
    ],
    story: "Zeynep, fen konusunu sınavdan önce uzun süre çalışıyordu ama çabuk unutuyordu. Konuya ertesi gün 10 dakika, üç gün sonra da 10 soru ayırdı. Bilgileri daha kolay hatırladığını gördü.",
    task: "Bugün öğrendiğin bir konu için üç günlük tekrar planı hazırla.",
    fields: [
      ["todayTopic", "Bugün hangi konuyu öğrendim?", "text", "Örnek: Maddenin hâlleri"],
      ["tomorrowReview", "Bu konuyu yarın nasıl tekrar edeceğim?", "textarea", "Örnek: Notlarıma bakıp 5 soru çözeceğim."],
      ["thirdDayQuestions", "3 gün sonra hangi soruları çözeceğim?", "textarea", "Soru kaynağını veya soru türünü yaz."],
      ["weekTest", "Bir hafta sonra kendimi nasıl test edeceğim?", "textarea", "Örnek: Notlara bakmadan konuyu anlatacağım."]
    ],
    checks: ["Konuyu kısa notla özetledim.", "Ertesi gün tekrar zamanı belirledim.", "Test çözme günü ekledim.", "Zorlandığım yeri işaretledim."]
  },
  {
    id: 4,
    icon: "✍️",
    title: "Not Tutma Yöntemleri",
    short: "Bilgiyi seç, sadeleştir ve kendi cümlelerinle düzenle.",
    description: "Not tutmak, bilgiyi sadece yazmak değildir. Önemli olan bilgiyi seçmek, kısaltmak ve anlaşılır hâle getirmektir. Kendi cümlelerinle yazdığın notu hatırlaman daha kolay olur. İyi bir not, tekrar yaparken sana zaman kazandırır.",
    goal: "Bu modülün sonunda kısa, düzenli ve işe yarayan bir konu özeti çıkarabileceksin.",
    lesson: [
      ["🔑", "Anahtar kelime seç", "Her cümleyi değil, temel kavramları yaz."],
      ["💬", "Kendi dilini kullan", "Bilgiyi anlayarak ve sadeleştirerek anlat."],
      ["🧩", "Örnek ekle", "Bir örnek, bilgiyi hatırlaman için güçlü bir ipucudur."]
    ],
    story: "Arda, öğretmenin söylediği her şeyi yazmaya çalışınca konuyu kaçırıyordu. Sonra yalnızca anahtar kelimeleri ve bir örneği yazdı. Ders sonunda bu kelimelere bakarak konuyu kendi cümleleriyle anlatabildi.",
    task: "Seçtiğin bir konunun kısa özetini oluştur. En önemli üç bilgiyi kendi cümlelerinle yaz.",
    fields: [
      ["noteTopic", "Bugün hangi konudan not çıkaracağım?", "text", "Örnek: Fiiller"],
      ["topThree", "Konunun en önemli 3 bilgisi nedir?", "textarea", "Bilgileri 1, 2, 3 diye sıralayabilirsin."],
      ["example", "Bu konuyla ilgili bir örnek yaz.", "textarea", "Kendi örneğini oluştur."],
      ["unclearPart", "Anlamadığım yer neresi?", "textarea", "Anlamadığın yer yoksa bunu da yazabilirsin."],
      ["selfQuestion", "Bu notu tekrar ederken kendime hangi soruyu soracağım?", "textarea", "Örnek: Fiili nasıl bulurum?"]
    ],
    checks: ["Gereksiz ayrıntıları yazmadım.", "Anahtar kelimeleri belirledim.", "Kendi cümlelerimi kullandım.", "Örnek ekledim."]
  },
  {
    id: 5,
    icon: "🔎",
    title: "Okuduğunu Daha İyi Anlama",
    short: "Bir metnin konusunu, ana fikrini ve önemli ayrıntılarını bul.",
    description: "Okuduğunu anlamak sadece metni seslendirmek değildir. Metnin konusunu, ana fikrini ve önemli ayrıntılarını fark etmek gerekir. Bilmediğin kelimeleri bulmak da anlamayı güçlendirir. Okuma sonunda metni kendi cümlelerinle anlatabiliyorsan doğru yoldasın.",
    goal: "Bu modülün sonunda kısa bir metni temel unsurlarıyla analiz edebileceksin.",
    lesson: [
      ["📌", "Konuyu bul", "Metnin en çok neden söz ettiğini belirle."],
      ["💡", "Ana fikri yakala", "Yazarın asıl vermek istediği düşünceyi sor."],
      ["🗣️", "Kendi cümlenle anlat", "Metni birkaç cümleyle yeniden anlatmayı dene."]
    ],
    story: "Selin, bir paragrafı hızlıca okuyup sorulara geçtiğinde ayrıntıları karıştırıyordu. Önce başlığa baktı, sonra her paragrafın yanına bir anahtar kelime yazdı. Metnin ana fikrini bulması kolaylaştı.",
    task: "Kısa bir metin seç ve aşağıdaki sorularla metni incele.",
    fields: [
      ["textName", "Okuduğum metnin adı nedir?", "text", "Metnin başlığını yaz."],
      ["subject", "Metnin konusu nedir?", "textarea", "Metinde en çok neden söz ediliyor?"],
      ["mainIdea", "Metnin ana fikri nedir?", "textarea", "Yazar bize asıl ne anlatmak istiyor?"],
      ["importantInfo", "Metindeki en önemli bilgi nedir?", "textarea", "Sence en önemli ayrıntıyı yaz."],
      ["conclusion", "Metinden çıkardığım sonuç nedir?", "textarea", "Kendi düşünceni yaz."],
      ["unknownWords", "Anlamını bilmediğim kelimeler neler?", "textarea", "Yoksa “Bilmediğim kelime yok.” yazabilirsin."]
    ],
    checks: ["Metni dikkatlice okudum.", "Konuyu belirledim.", "Ana fikri yazdım.", "Bilmediğim kelimeleri not aldım.", "Metni kendi cümlelerimle özetledim."]
  },
  {
    id: 6,
    icon: "🧭",
    title: "Soru Çözerken Hata Analizi",
    short: "Yanlışlarının nedenini bul ve bir sonraki adımını belirle.",
    description: "Yanlış yapmak başarısızlık değildir. Yanlışlar, neyi öğrenmen gerektiğini gösteren işaretlerdir. Önemli olan yanlışı fark etmek ve nedenini bulmaktır. Hata nedenini bilirsen aynı hatayı azaltmak için doğru adımı seçebilirsin.",
    goal: "Bu modülün sonunda yanlış sorularını nedenlerine göre inceleyebileceksin.",
    lesson: [
      ["🔍", "Nedeni ara", "Yanlışın konu, dikkat, işlem veya zaman kaynaklı olabilir."],
      ["📒", "Hata notu tut", "Kısa bir not, aynı hatayı tekrar fark etmeni sağlar."],
      ["🧪", "Benzerini dene", "Eksik olduğun türden birkaç yeni soru çöz."]
    ],
    story: "Can, matematik testinde yaptığı üç yanlışı yeniden çözdü. İkisinde soruyu hızlı okuduğunu, birinde de konuyu karıştırdığını fark etti. Bir sonraki testte soru köklerinin altını çizdi ve konu notuna geri döndü.",
    task: "Son çözdüğün bir testin sonuçlarını incele ve en önemli hata nedenini belirle.",
    fields: [
      ["lesson", "Hangi dersten soru çözdüm?", "text", "Örnek: Matematik"],
      ["correct", "Kaç doğru yaptım?", "number", "Örnek: 12"],
      ["wrong", "Kaç yanlış yaptım?", "number", "Örnek: 3"],
      ["errorReason", "Yanlışımın sebebi neydi?", "select", "Bir neden seç.", ["Konuyu bilmiyordum.", "Soruyu dikkatli okumadım.", "İşlem hatası yaptım.", "Zamanı iyi kullanamadım.", "İki seçenek arasında kaldım."]],
      ["nextTime", "Bir sonraki çözümde neye dikkat edeceğim?", "textarea", "Kendine kısa bir hatırlatma yaz."]
    ],
    checks: ["Yanlış soruları işaretledim.", "Hata nedenini yazdım.", "Konu eksiğimi belirledim.", "Benzer soru çözeceğim."]
  },
  {
    id: 7,
    icon: "📊",
    title: "Deneme Sınavı Nasıl Analiz Edilir?",
    short: "Deneme sonucunu puandan öteye taşı ve yol haritasına çevir.",
    description: "Deneme sınavı sadece puan görmek için yapılmaz. Deneme, güçlü olduğun ve desteğe ihtiyaç duyduğun konuları gösterir. Doğru ve yanlış sayılarını incelemek ilk adımdır. Asıl gelişim, bu sonuçtan yeni bir çalışma hedefi çıkardığında başlar.",
    goal: "Bu modülün sonunda bir deneme sınavını derslere ve hedeflere göre inceleyebileceksin.",
    lesson: [
      ["📋", "Sonucu yaz", "Her dersin doğru ve yanlış sayısını ayrı ayrı gör."],
      ["🧠", "Nedeni düşün", "Konu eksiği, dikkat ve zaman durumunu değerlendir."],
      ["🚀", "Üç konu seç", "Sonraki denemeye kadar çalışacağın üç konu belirle."]
    ],
    story: "Defne, denemede yalnızca toplam puanına bakıp üzülüyordu. Son denemesinde yanlışlarını derslere ayırdı. Türkçede paragraf, matematikte kesirler konusuna odaklanınca sonraki denemede ilerleme gördü.",
    task: "Son deneme sınavının sonuçlarını yaz ve bir sonraki denemeye kadar üç çalışma konusu seç.",
    fields: [
      ["examDate", "Deneme sınavı tarihi", "date", ""],
      ["turkish", "Türkçe doğru / yanlış", "text", "Örnek: 16 doğru / 4 yanlış"],
      ["math", "Matematik doğru / yanlış", "text", "Örnek: 12 doğru / 6 yanlış"],
      ["science", "Fen doğru / yanlış", "text", "Örnek: 15 doğru / 5 yanlış"],
      ["social", "Sosyal doğru / yanlış", "text", "Örnek: 8 doğru / 2 yanlış"],
      ["english", "İngilizce doğru / yanlış", "text", "Örnek: 9 doğru / 1 yanlış"],
      ["bestLesson", "En başarılı olduğum ders", "text", "Bir ders yaz."],
      ["hardLesson", "En çok zorlandığım ders", "text", "Bir ders yaz."],
      ["timeEnough", "Zamanı yetiştirebildim mi?", "select", "Seçimini yap.", ["Evet, yetiştirdim.", "Kısmen yetiştirdim.", "Hayır, yetiştiremedim."]],
      ["nextTopics", "Bir sonraki denemeye kadar çalışacağım 3 konu", "textarea", "Konuları 1, 2, 3 diye sıralayabilirsin."]
    ],
    checks: ["Doğru ve yanlışlarımı yazdım.", "En zayıf dersimi belirledim.", "Konu eksiğimi yazdım.", "Yeni hedef belirledim."]
  },
  {
    id: 8,
    icon: "🌤️",
    title: "Sınav Kaygısıyla Baş Etme",
    short: "Heyecanını fark et, nefesini düzenle ve kendine destek ol.",
    description: "Sınav öncesi heyecan normaldir. Ancak kaygı çok artarsa bildiklerini hatırlamak zorlaşabilir. Kaygıyı azaltmak için nefes, hazırlık ve doğru düşünme önemlidir. Amaç kaygıyı tamamen yok etmek değil, onu yönetebilmektir.",
    goal: "Bu modülün sonunda sınav öncesi ve sınav anı için sakinleşme planı hazırlayabileceksin.",
    lesson: [
      ["🫁", "Nefesini yavaşlat", "Dört saniye nefes al, dört saniye bekle, dört saniye ver."],
      ["💭", "Cümleni değiştir", "“Yapamam” yerine “Elimden gelen adımı uygulayabilirim” de."],
      ["🎒", "Önceden hazırlan", "Malzemelerini ve uyku düzenini son güne bırakma."]
    ],
    story: "Bora, sınavdan önce kalbinin hızlı attığını hissediyordu. Sınav başlamadan önce üç kez yavaşça nefes aldı ve “Önce bildiğim sorulardan başlayacağım.” dedi. Heyecanı tamamen geçmedi ama onu yönetebildi.",
    task: "Sınav öncesinde kullanabileceğin kişisel sakinleşme planını yaz.",
    fields: [
      ["worry", "Sınav öncesi beni en çok ne kaygılandırıyor?", "textarea", "Aklından geçen düşünceyi yaz."],
      ["bodyFeeling", "Kaygılanınca vücudumda ne hissediyorum?", "textarea", "Örnek: Kalbim hızlı atıyor."],
      ["positiveSentence", "Kendime söyleyeceğim olumlu cümle nedir?", "textarea", "Sana güç veren gerçekçi bir cümle yaz."],
      ["preparation", "Sınavdan önce nasıl hazırlanacağım?", "textarea", "Uyku, malzemeler ve tekrar planını düşün."],
      ["breathing", "Kaygı anında hangi nefes egzersizini yapacağım?", "textarea", "Örnek: 4 saniye al, 4 bekle, 4 ver."]
    ],
    checks: ["Kaygımı fark ettim.", "Olumlu cümle yazdım.", "Nefes egzersizi belirledim.", "Sınav öncesi hazırlık planı yaptım."]
  },
  {
    id: 9,
    icon: "⏳",
    title: "Zaman Yönetimi",
    short: "Gününü gözden geçir ve ders, mola, eğlence dengesini kur.",
    description: "Zamanı iyi yönetmek, daha çok çalışmak değil, zamanı doğru kullanmaktır. Kısa ama düzenli çalışma uzun ve plansız çalışmadan daha etkilidir. Günündeki boşlukları fark edersen yapmak istediklerine yer açabilirsin. Eğlence ve dinlenme de dengeli bir planın parçasıdır.",
    goal: "Bu modülün sonunda kendi günlük zaman çizelgeni oluşturabileceksin.",
    lesson: [
      ["🕰️", "Boş zamanı gör", "Okul, yemek ve uyku dışındaki zamanlarını belirle."],
      ["⚡", "Güçlü saatini seç", "Daha dinç olduğun saati önemli görev için kullan."],
      ["⚖️", "Denge kur", "Ders, mola ve eğlence için belirli süreler ayır."]
    ],
    story: "İpek, okuldan sonra zamanının kalmadığını düşünüyordu. Bir gününü yazınca oyun ve telefon için fark etmeden iki saat ayırdığını gördü. Bu sürenin 30 dakikasını derse ayırıp yine dinlenmeye zaman bıraktı.",
    task: "Bugünün zaman çizelgesini düşün ve çalışma için sana uygun bir aralık seç.",
    fields: [
      ["freeHours", "Okuldan sonra hangi saatlerde boşum?", "text", "Örnek: 17.00–20.00"],
      ["bestHour", "Gün içinde en verimli olduğum saat hangisi?", "text", "Örnek: 18.00"],
      ["studyMinutes", "Ders çalışma için kaç dakika ayıracağım?", "number", "Örnek: 40"],
      ["breakTime", "Mola saatim ne zaman olacak?", "text", "Örnek: 18.25"],
      ["funTime", "Telefon veya oyun için ne kadar zaman ayıracağım?", "text", "Örnek: 45 dakika"],
      ["todayImprove", "Bugün zamanımı daha iyi kullanmak için ne yapacağım?", "textarea", "Tek bir küçük değişiklik yaz."]
    ],
    checks: ["Boş zamanlarımı belirledim.", "Ders saatimi seçtim.", "Mola ekledim.", "Eğlence zamanımı sınırladım."]
  },
  {
    id: 10,
    icon: "🏆",
    title: "Hedef Belirleme",
    short: "Net, ölçülebilir ve ulaşılabilir hedeflerle ilerle.",
    description: "Hedef belirlemek, nereye gitmek istediğini bilmektir. Belirsiz hedefler yerine ölçülebilir ve ulaşılabilir hedefler koymak daha etkilidir. Büyük bir hedefi günlük küçük adımlara bölebilirsin. İlerlediğini görmek devam etme isteğini güçlendirir.",
    goal: "Bu modülün sonunda haftalık ve aylık, ölçülebilir bir hedef yazabileceksin.",
    lesson: [
      ["📍", "Net ol", "“Daha çok çalışacağım” yerine ne yapacağını açıkça yaz."],
      ["📏", "Ölçülebilir yap", "Kaç soru, kaç dakika veya kaç gün olduğunu belirt."],
      ["🪜", "Adımlara böl", "Her gün yapabileceğin küçük bir hareket seç."]
    ],
    story: "Emir, “Türkçemi geliştireceğim” diye hedef koydu ama nereden başlayacağını bilemedi. Hedefini “Bu hafta dört gün, 15 paragraf sorusu çözeceğim” diye değiştirdi. Her gün yaptığı adımı kolayca takip etti.",
    task: "Kendine bir haftalık ve bir aylık hedef yaz. Hedeflerinin nasıl ölçüleceğini de belirt.",
    fields: [
      ["weeklyGoal", "Bu haftaki ders hedefim nedir?", "textarea", "Net ve küçük bir hedef yaz."],
      ["measurement", "Bu hedefi nasıl ölçeceğim?", "textarea", "Sayı, süre veya gün belirtebilirsin."],
      ["dailyStep", "Hedefime ulaşmak için her gün ne yapacağım?", "textarea", "Günlük küçük adımını yaz."],
      ["monthlyGoal", "Bu ay hangi konuda gelişmek istiyorum?", "textarea", "Bir ders veya beceri seç."],
      ["reward", "Hedefime ulaşırsam kendimi nasıl ödüllendireceğim?", "textarea", "Sana iyi gelecek küçük bir ödül seç."]
    ],
    checks: ["Hedefim net.", "Hedefim ölçülebilir.", "Hedefim gerçekçi.", "Hedefim için günlük adım belirledim."]
  }
];

// Öğretmenin sürekli devam eden özel dersleri için hazırlanan ikinci program.
// Bu katalog ana Akademi modüllerinden ayrıdır; her öğrencinin başlangıç tarihi,
// cevapları ve tamamlanma kayıtları kendi çevrim içi öğrenci verisinde saklanır.
const WORKSHOP_MODULES = [
  {
    id: 1, icon: "🎯", title: "Akıllı Hedefler", short: "Hayalini net, ölçülebilir ve tarihli bir yol haritasına dönüştür.",
    description: "Bir hayal sana yön verir; hedef ise o yöne doğru atacağın adımları gösterir. ‘Derslerimde daha iyi olacağım’ gibi belirsiz bir istek nereden başlayacağını söylemez. AKILLI hedefler; belirgin, ölçülebilir, ulaşılabilir, senin için anlamlı ve zaman sınırlı hedeflerdir. Böylece büyük görünen bir amaç küçük ve uygulanabilir adımlara dönüşür.",
    goal: "Bu haftanın sonunda bir isteğini AKILLI hedefe dönüştürecek ve ilk küçük adımını belirleyeceksin.",
    lesson: [["🔎", "Belirgin ve ölçülebilir ol", "Ne yapacağını ve ilerlemeyi hangi sayı ya da sonuçla izleyeceğini açıkça yaz."], ["🪜", "Ulaşılabilir adımlar seç", "Büyük hedefi, hangi gün yapacağın küçük parçalara böl."], ["🧭", "Nedenini ve tarihini ekle", "Hedefin senin için neden anlamlı olduğunu ve ne zaman biteceğini belirle."]],
    steps: ["Aklındaki genel isteği bir cümleyle yaz.", "Ne, neden ve ne kadar sorularıyla hedefi netleştir.", "Hedefi küçük günlük adımlara böl.", "Bir bitiş tarihi koy ve ilerlemeni nasıl ölçeceğini seç.", "Plan işlemezse kendini suçlama; yöntemi değerlendirip yeniden düzenle."],
    story: { title: "Uzak görünen hayal nasıl yakına gelir?", paragraphs: ["Deniz, matematik notunu yükseltmek istiyordu. Defterinin ilk sayfasına yalnızca ‘Matematikte daha iyi olacağım’ yazdı. Ancak ertesi gün hangi konuya, ne kadar süre çalışacağını bilemediği için başlamayı yine erteledi.", "Öğretmeni bu cümleyi birlikte değiştirmeyi önerdi: ‘Önümüzdeki üç hafta boyunca hafta içi her gün 25 dakika problem çözüp cuma günleri doğru sayımı kaydedeceğim.’ Deniz artık ne yapacağını, ne zaman yapacağını ve gelişimini nasıl göreceğini biliyordu.", "İlk hafta her gün planına uyamadı. Hedefinden vazgeçmek yerine iki yoğun günün süresini 15 dakikaya indirdi. Yol değişti ama hedef yerinde kaldı."], takeaway: "Hedefin netleştiğinde başlamak kolaylaşır. Plan aksarsa hedefini değil, kullandığın yolu yeniden düzenleyebilirsin." },
    task: "Bu hafta için sana gerçekten anlamlı olan bir AKILLI hedef hazırla ve ilk 15–30 dakikalık adımını planla.",
    fields: [["dream", "Aklımdaki istek veya hayal nedir?", "textarea", "Örnek: Matematikte kendimi geliştirmek."], ["specific", "Hedefimi belirgin hâle getirirsem tam olarak ne yapacağım?", "textarea", "Ders, konu ve davranışı açıkça yaz."], ["measure", "İlerlememi nasıl ölçeceğim?", "text", "Soru sayısı, süre, puan veya tamamlanan görev..."], ["steps", "Hedefime ulaşmak için küçük adımlarım neler?", "textarea", "Adımlarını günlere bölebilirsin."], ["reason", "Bu hedef benim için neden anlamlı?", "textarea", "Kendi nedenini yaz."], ["deadline", "Başlangıç ve bitiş tarihim nedir?", "text", "Örnek: 26 Ağustos–16 Eylül"]],
    checks: ["Hedefim belirgin.", "Hedefim ölçülebilir.", "Hedefim ulaşılabilir.", "Hedefimin benim için anlamlı bir nedeni var.", "Hedefime bir bitiş tarihi koydum."],
    quiz: { question: "Aşağıdakilerden hangisi AKILLI hedefe daha yakındır?", options: ["Bir ara daha çok kitap okuyacağım.", "Bu ay her gün 20 dakika kitap okuyup günleri işaretleyeceğim.", "Bütün derslerimi hemen düzelteceğim."], answer: 1, explanation: "Bu hedef ne yapılacağını, süresini ve ilerlemenin nasıl izleneceğini açıkça gösterir." }
  },
  {
    id: 2, icon: "🧰", title: "Kendi Çalışma Stilini Keşfet", short: "Öğrenme alet çantanı tanı ve derse göre doğru yöntemi seç.",
    description: "Bazen bir metni tekrar tekrar okuduğun hâlde anlamadığını düşünebilirsin. Bunun nedeni zekân değil, kullandığın yöntemin göreve uygun olmaması olabilir. Görsel, işitsel, okuma-yazma ve kinestetik yöntemler farklı öğrenme araçlarıdır. Amaç kendini tek bir kutuya koymak değil; bütün araçları tanıyıp gereken yerde doğru olanı seçmektir.",
    goal: "Bu haftanın sonunda güçlü öğrenme tercihlerini fark edecek ve iki farklı yöntemi birlikte kullanacağın bir çalışma deneyi hazırlayacaksın.",
    lesson: [["👁️", "Görsel", "Şema, renk, grafik, zihin haritası ve videolarla bilgiyi görünür hâle getir."], ["🎧", "İşitsel", "Yüksek sesle anlat, dinle, tartış ve kendi sesli notunu kullan."], ["✍️", "Okuma-yazma ve hareket", "Özet, liste ve bilgi kartlarını; model, rol yapma ve hareketli tekrarla birleştir."]],
    steps: ["Daha önce kolay öğrendiğin bir konuyu düşün ve ne yaptığını hatırla.", "GİOK araçlarından sana başlangıçta en rahat geleni seç.", "Aynı konu için ikinci, farklı bir araç daha ekle.", "Denemeden sonra hangi yöntemin hangi derste işe yaradığını not et."],
    story: { title: "Bir usta neden yalnızca çekiç taşımaz?", paragraphs: ["Ela, fen dersinde renkli şemalarla çok hızlı öğreniyordu. Bu yüzden kendisini ‘Ben sadece görsel öğrenirim’ diye tanımlamaya başladı. İngilizce konuşma çalışmasında da yalnızca renkli notlar hazırladı; fakat kelimeleri duyduğunda tanımakta zorlandı.", "Bir marangozun her işte aynı aleti kullanmadığını düşündü. Fen için şema çizerken İngilizcede kelimeleri sesli söylemeye, kendi sesini kaydetmeye ve kısa diyaloglar kurmaya başladı.", "Ela’nın güçlü görsel aracı hâlâ çantasındaydı. Fakat artık göreve göre başka araçlara da uzanıyordu. Başarısını artıran şey tek bir stile sahip olması değil, stratejik olarak esnek davranmasıydı."], takeaway: "Öğrenme stilin bir etiket değil, başlangıç aracındır. En iyi sonuç için göreve göre farklı araçları birlikte kullan." },
    task: "Aynı konuyu iki farklı GİOK yöntemiyle çalış ve hangisinin ne işe yaradığını karşılaştır.",
    fields: [["easyLearning", "En kolay öğrendiğim bir konuyu nasıl çalışmıştım?", "textarea", "Ne gördün, duydun, yazdın veya yaptın?"], ["strongTool", "Başlarken bana en rahat gelen öğrenme aracı hangisi? Neden?", "textarea", "Görsel, işitsel, okuma-yazma veya kinestetik."], ["visual", "Bu hafta kullanacağım bir görsel yöntem nedir?", "text", "Örnek: Zihin haritası."], ["auditory", "Bu hafta kullanacağım bir işitsel yöntem nedir?", "text", "Örnek: Konuyu yüksek sesle anlatmak."], ["active", "Okuma-yazma veya hareket içeren yöntemim nedir?", "text", "Örnek: Bilgi kartı ya da model."], ["experiment", "Hangi derste hangi iki yöntemi birlikte deneyeceğim?", "textarea", "Kısa deney planını yaz."]],
    checks: ["Kendimi tek bir öğrenme stiline hapsetmedim.", "En az iki farklı yöntem seçtim.", "Yöntemimi dersin yapısına göre belirledim.", "Deneyimin sonucunu gözlemlemeye hazırım."],
    quiz: { question: "Stratejik esneklik ne demektir?", options: ["Her derste yalnızca sevdiğim yöntemi kullanmak", "Göreve göre en uygun öğrenme aracını bilinçli seçmek", "Öğrenme stilimi hiç değiştirmemek"], answer: 1, explanation: "Farklı dersler farklı araçlar ister. Esneklik, araç çantanın tamamını kullanabilmektir." }
  },
  {
    id: 3, icon: "🍅", title: "Pomodoro ve Zaman Yönetimi", short: "Zamanını kısa odak blokları, gerçek molalar ve net görevlerle yönet.",
    description: "Dikkat dağıldığında beynin aynı anda birçok sekmesi açık bir bilgisayar gibi yorulur. Pomodoro tekniği, çalışmayı kısa ve bölünmeyen odak bloklarına ayırır. Klasik düzen 25 dakika çalışma ve 5 dakika gerçek moladır. Dört turdan sonra daha uzun bir mola verilir; böylece başlamak kolaylaşır ve zihinsel yorgunluk azalır.",
    goal: "Bu haftanın sonunda tek bir görevi Pomodoro ile tamamlayacak, mola ve zaman bloklarını kendi gününe yerleştireceksin.",
    lesson: [["1️⃣", "Tek görevi seç", "Bir odak bloğunda yalnızca neyi tamamlayacağını açıkça belirle."], ["⏲️", "25 dakika odaklan", "Süre boyunca bildirimleri kapat; aklına gelen başka işleri kenara not et."], ["🌿", "Molayı gerçekten kullan", "5 dakikada ekrana geçmek yerine kalk, su iç ve hareket et. Dört turdan sonra 15–30 dakika dinlen."]],
    steps: ["Bugünün tek ve net görevini seç.", "Telefonu uzaklaştırıp zamanlayıcıyı 25 dakikaya kur.", "Alarm çalana kadar yalnızca seçtiğin işe odaklan.", "5 dakika gerçek mola ver; dört turdan sonra uzun mola yap.", "Günün en zor görevini en enerjik olduğun zaman bloğuna koy."],
    story: { title: "Bir domates zamanlayıcısı neden milyonların yöntemine dönüştü?", paragraphs: ["Üniversite öğrencisi Francesco Cirillo, derslerine odaklanmakta zorlandığında kendine küçük bir meydan okuma verdi. Domates biçimindeki mutfak zamanlayıcısını kurup yalnızca kısa bir süre boyunca tek işe odaklanmayı denedi.", "Uzun saatleri düşünmek gözünde büyürken kısa bir süre için başlamak daha kolaydı. Her tur sonunda verdiği mola, zihninin dinlenmesini; tamamlanan küçük turlar da ilerlemeyi görmesini sağladı.", "Bugün Pomodoro adı verilen yöntem, zamanla savaşmak yerine zamanı bir yardımcıya dönüştürür. Sihir zamanlayıcıda değil; tek görev, kesintisiz odak ve disiplinli mola düzenindedir."], takeaway: "‘Saatlerce çalışmalıyım’ düşüncesi yerine yalnızca ilk odak bloğunu başlat. Büyük ilerleme, tamamlanan küçük turlardan oluşur." },
    task: "Bugün bir zor görev seç, en az bir 25+5 turu uygula ve tur sonunda ne kadar ilerlediğini değerlendir.",
    fields: [["frog", "Bugünün en zor veya en önemli görevi nedir?", "textarea", "Önce halledeceğin ‘kurbağayı’ yaz."], ["pomodoroGoal", "İlk 25 dakikada tam olarak ne yapacağım?", "textarea", "Tek ve ölçülebilir bir görev seç."], ["distractions", "Odak süremde hangi dikkat dağıtıcıları uzaklaştıracağım?", "textarea", "Telefon, bildirim, gereksiz sekmeler..."], ["break", "5 dakikalık molamda ne yapacağım?", "text", "Ekransız bir mola seç."], ["blocks", "Bugünkü zaman bloklarım nasıl olacak?", "textarea", "Ders, mola, yemek ve serbest zamanı sırala."], ["result", "Deneme sonunda ne fark ettim?", "textarea", "Başlamak, odaklanmak ve mola hakkında kısa not."]],
    checks: ["Görevimi net seçtim.", "Zamanlayıcı kullandım.", "Odak sırasında başka işe geçmedim.", "Molada telefona bakmadım.", "Tur sonunda sonucumu değerlendirdim."],
    quiz: { question: "Klasik bir Pomodoro turu nasıl ilerler?", options: ["25 dakika çalışma, 5 dakika mola", "5 dakika çalışma, 25 dakika telefon", "İş bitene kadar hiç mola vermeme"], answer: 0, explanation: "Kısa ve kesintisiz odak ile gerçek mola birlikte çalışır." }
  },
  {
    id: 4, icon: "⚖️", title: "Parkinson ve Pareto İlkeleri", short: "Önce en etkili işi bul, sonra ona kısa ve net bir süre ver.",
    description: "Parkinson ilkesi, bir işin ona ayırdığın süreyi dolduracak kadar uzayabildiğini söyler. Pareto ilkesi ise sonuçların büyük bölümünün az sayıdaki önemli etkenden gelebileceğini anlatır. Her konuya eşit zaman vermek yerine en çok gelişim sağlayacak alanı bulmak gerekir. İki ilkeyi birlikte kullandığında doğru işe doğru süreyi ayırırsın.",
    goal: "Bu haftanın sonunda en etkili yüzde 20’lik çalışma alanını seçecek ve ona gerçekçi bir zaman sınırı koyacaksın.",
    lesson: [["⏳", "Parkinson: süreyi sınırla", "Belirsiz ve uzun süreler oyalanmayı artırabilir; göreve kısa ve net bir bitiş süresi koy."], ["📊", "Pareto: etkiyi bul", "Yanlışlarının veya puan kaybının büyük kısmını oluşturan az sayıdaki konuyu belirle."], ["🤝", "Birlikte kullan", "Önce en etkili görevi seç, sonra bu göreve odaklı bir süre ver."]],
    steps: ["Son çalışmalarındaki yanlışları veya eksikleri gruplandır.", "En çok sonuç getirecek bir alanı seç.", "Görevi tam olarak ne yapacağını gösterecek biçimde yaz.", "20–40 dakika arasında gerçekçi bir süre sınırı koy.", "Süre sonunda gereksiz ayrıntıları ve ilerlemeyi değerlendir."],
    story: { title: "İki haftalık iş neden son geceye kalır?", paragraphs: ["Arda’ya bir sunum hazırlaması için iki hafta verildi. İlk gün ‘Daha çok zaman var’ diyerek kapağın renkleriyle uğraştı, sonra başka işlere geçti. Teslime bir gün kala asıl araştırmaya henüz başlamadığını fark etti.", "Bir sonraki görevinde önce puanı en çok etkileyecek bölümü buldu: doğru kaynaklardan ana bilgileri çıkarmak. Bu işe 35 dakikalık net bir süre verdi ve telefonu başka odaya bıraktı.", "Kısa süre Arda’yı özensiz yapmadı; gereksiz ayrıntılardan korudu. En önemli bölüme önce odaklandığı için kalan işleri de daha sakin tamamladı."], takeaway: "Çok zaman her zaman çok verim değildir. Önce sonucu en çok değiştirecek işi seç, sonra ona odaklanabileceğin net bir süre ver." },
    task: "Son deneme veya ödevinden en çok etki oluşturacak alanı bul ve bu alan için süre sınırı olan bir çalışma yap.",
    fields: [["evidence", "Son çalışmalarımda en çok yanlış veya gecikme hangi alanda oldu?", "textarea", "Somut örnek yaz."], ["vital20", "Bana en büyük ilerlemeyi sağlayacak küçük ama önemli alan nedir?", "textarea", "Pareto alanını seç."], ["task", "Bu alan için yapacağım net görev nedir?", "textarea", "Örnek: 20 paragraf sorusundaki hata türlerini ayırmak."], ["limit", "Bu göreve kaç dakika sınır koyacağım?", "number", "20–40 dakika arası deneyebilirsin."], ["remove", "Süre boyunca hangi dikkat dağıtıcıyı kaldıracağım?", "text", "Tek bir önlem seç."], ["review", "Süre sonunda neyi değerlendireceğim?", "textarea", "İlerleme, oyalanma ve bir sonraki adım."]],
    checks: ["En etkili alanı kanıta göre seçtim.", "Görevimi net yazdım.", "Gerçekçi bir süre sınırı koydum.", "Dikkat dağıtıcıları azalttım.", "Süre sonunda sonucu değerlendirdim."],
    quiz: { question: "Parkinson ve Pareto birlikte nasıl kullanılır?", options: ["Her konuya eşit ve sınırsız zaman vermek", "Önce en etkili görevi seçip sonra ona net süre koymak", "Yalnızca en kolay işleri yapmak"], answer: 1, explanation: "Pareto önceliği, Parkinson ise süreyi yönetmene yardım eder." }
  },
  {
    id: 5, icon: "🧠", title: "Odak Kasını Geliştir", short: "Dikkat kopuşunu fark et, geri dön ve odak kasını küçük antrenmanlarla güçlendir.",
    description: "Odaklanmak dikkati tek bir işe yöneltme becerisidir. Telefon, bildirimler, dağınık masa, uykusuzluk ve aynı anda çok iş yapmak bu beceriyi zorlar. Odaklanma doğuştan sabit değildir; bir kas gibi düzenli antrenmanla gelişir. Dikkatinin dağılması başarısızlık değil, kopuşu fark edip geri dönme alıştırmasının başladığı andır.",
    goal: "Bu haftanın sonunda çevresel ve zihinsel dikkat dağıtıcılarını ayıracak, günlük kısa bir odak antrenmanı oluşturacaksın.",
    lesson: [["🏠", "Çevresel dağıtıcılar", "Telefon, gürültü, dağınıklık ve gereksiz eşyalar gibi fiziksel etkenleri azalt."], ["💬", "Etkileşimsel ve zihinsel dağıtıcılar", "Mesaj bekleme, stres ve iç konuşma gibi görünmeyen kopuşları fark et."], ["↩️", "Fark et ve geri dön", "Dikkat koptuğunda kendini yargılamadan tek işe dön; asıl antrenman budur."]],
    steps: ["Çalışmadan önce dikkatini aşağı çeken etkenleri yaz.", "Masayı sadeleştir ve telefonu görüş alanından çıkar.", "1–2 dakikalık nefes veya görsel odak egzersizi yap.", "Çalışırken kopuşu fark ettiğinde kısa bir işaret koyup göreve dön.", "Günün sonunda kaç kez geri dönebildiğini değerlendir."],
    story: { title: "Gürültülü zihinden akış bölgesine", paragraphs: ["Selin masasına oturur oturmaz bir yandan mesaj bekliyor, bir yandan da yarınki sınavı düşünüyordu. Kitabı açıktı ama dikkati sürekli yukarı ve aşağı çekilen bir terazi gibiydi.", "Bir gün dikkatinin her dağılmasını hata saymak yerine antrenmanın bir parçası olarak görmeye başladı. Telefonunu dışarı koydu, bir dakika nefesine odaklandı ve her kopuşta kâğıda küçük bir nokta koyup soruya geri döndü.", "İlk gün çok nokta vardı. Bir hafta sonra noktalar azaldı; daha önemlisi Selin, dikkat dağıldığında geri dönmeyi öğrenmişti. Güçlenen şey hiç kopmaması değil, dönüş becerisiydi."], takeaway: "Odaklanmanın ölçüsü hiç dağılmamak değildir. Kopuşu daha erken fark edip nazikçe geri dönebilmek gerçek gelişimdir." },
    task: "Bir çalışma oturumunda dikkat dağıtıcı haritanı çıkar, 1–2 dakikalık egzersiz yap ve kopuşlardan göreve dönüşünü izle.",
    fields: [["environment", "Çevremde dikkatimi en çok dağıtan şey nedir?", "textarea", "Telefon, ses, masa..."], ["inner", "Zihnimde veya etkileşimlerimde beni aşağı çeken şey nedir?", "textarea", "Stres, mesaj bekleme, başka işler..."], ["setup", "Çalışma alanımı nasıl sadeleştireceğim?", "textarea", "Somut iki değişiklik yaz."], ["exercise", "Günlük 1–2 dakikalık odak egzersizim nedir?", "text", "Nefes, görsel odaklama, Schulte tablosu..."], ["return", "Dikkatim dağıldığında kendime ne deyip geri döneceğim?", "text", "Kısa ve yargılamayan bir cümle."], ["observation", "Antrenman sonunda ne fark ettim?", "textarea", "Kopuş ve dönüşlerini değerlendir."]],
    checks: ["Çevresel dikkat dağıtıcıları belirledim.", "Zihinsel dikkat dağıtıcıları fark ettim.", "Çalışma alanımı sadeleştirdim.", "Kısa odak egzersizini yaptım.", "Kopuşta kendimi suçlamadan geri döndüm."],
    quiz: { question: "Odak antrenmanında dikkat dağıldığında en doğru yaklaşım hangisidir?", options: ["Çalışmayı tamamen bırakmak", "Kendimi suçlamak", "Kopuşu fark edip sakince göreve dönmek"], answer: 2, explanation: "Dikkatin geri döndürülmesi, odak kasını güçlendiren asıl tekrardır." }
  },
  {
    id: 6, icon: "📉", title: "Unutma Eğrisi ve Aralıklı Tekrar", short: "Bilgiyi doğru zamanlarda hatırlayarak uzun süreli hafızanı güçlendir.",
    description: "Yeni bilgi tekrar edilmezse hatırlama düzeyi zamanla hızla düşebilir. Notu yeniden okumak tanıdık hissettirse de gerçek öğrenme, bilgiyi bakmadan hatırlamaya çalıştığında güçlenir. Aralıklı tekrar; aynı konuyu bir günde uzun uzun çalışmak yerine giderek açılan aralıklarla yeniden çağırmaktır. Her doğru zamanlı tekrar unutmayı yavaşlatır.",
    goal: "Bu haftanın sonunda bir konu için aynı gün, 1 gün, 3 gün, 7 gün ve daha sonrası için aktif tekrar takvimi kuracaksın.",
    lesson: [["🧠", "Aktif hatırla", "Notu kapatıp soruya cevap ver, konuyu anlat veya mini test çöz."], ["📅", "Aralıkları aç", "Aynı gün kısa tekrar yap; sonra 1, 3, 7, 15 ve 30 gün gibi giderek açılan aralıklarda dön."], ["🚩", "Zora daha sık dön", "Yanlış yaptığın veya hatırlayamadığın konuların aralığını kısalt."]],
    steps: ["Bugün öğrendiğin tek bir konuyu seç.", "Notlarını kapatıp bildiklerini kâğıda yaz veya sesli anlat.", "Eksiklerini farklı renkle işaretle.", "1, 3, 7, 15 ve 30 günlük tekrar tarihlerini belirle.", "Her tekrarda mini soru, bilgi kartı veya kısa test kullan."],
    story: { title: "Uzun çalışmak mı, doğru zamanda geri dönmek mi?", paragraphs: ["Bora sınavdan önce üç saat boyunca aynı konuya baktı. O akşam her şeyi bildiğini hissediyordu; fakat bir hafta sonra temel kavramları birbirine karıştırdı.", "Sonraki konuda farklı bir yol denedi. Aynı gün beş dakika özet çıkardı, ertesi gün notlarına bakmadan kendine soru sordu, üç gün sonra mini test çözdü ve yedinci gün konuyu kardeşine anlattı.", "Toplam süresi ilk yöntemden daha kısa olmasına rağmen bilgiyi daha uzun süre hatırladı. Çünkü beyni her dönüşte ‘Bu bilgi önemli’ sinyalini aldı."], takeaway: "Kalıcı öğrenme tek seferde çok bakmaktan değil, bilgiyi giderek açılan aralıklarla yeniden hatırlamaktan doğar." },
    task: "Bir konu seç, aktif hatırlama soruları hazırla ve beş basamaklı tekrar takvimini oluştur.",
    fields: [["topic", "Kalıcı hâle getirmek istediğim konu nedir?", "text", "Tek bir konu seç."], ["recall", "Notları kapattığımda kendime hangi 3 soruyu soracağım?", "textarea", "Sorular aktif hatırlamayı başlatsın."], ["sameDay", "Aynı gün yapacağım kısa tekrar nedir?", "text", "Özet, anlatma veya mini test."], ["day1", "1 gün sonraki tekrarım nasıl olacak?", "text", "Tarih ve yöntem yaz."], ["day3and7", "3 ve 7 gün sonraki tekrarlarım nasıl olacak?", "textarea", "İki aşamayı ayrı yaz."], ["later", "15 ve 30 gün sonra kendimi nasıl sınayacağım?", "textarea", "Kısa yoklama planı."]],
    checks: ["Bir konu seçtim.", "Notlara bakmadan hatırlamayı denedim.", "Tekrar tarihlerini yazdım.", "Mini soru veya test ekledim.", "Zorlandığım yeri ayrıca işaretledim."],
    quiz: { question: "Aralıklı tekrarın temel özelliği hangisidir?", options: ["Konuyu yalnızca sınav gecesi uzun süre okumak", "Bilgiyi giderek açılan zaman aralıklarında aktif olarak hatırlamak", "Notu hiç kapatmadan tekrar tekrar okumak"], answer: 1, explanation: "Aralık ve aktif hatırlama birlikte kullanıldığında bilgi daha kalıcı olur." }
  },
  {
    id: 7, icon: "💬", title: "Kelimelerin Kimyası", short: "Kullandığın cümlelerle zihnini kilitlemek yerine çözüm üretme moduna geçir.",
    description: "Kendi kendine söylediğin sözler yalnızca ses değildir; dikkatin ve davranışın için bir yönlendirmedir. ‘Yapamam’ dediğinde zihnin geçmiş başarısızlıkları aramaya başlar. ‘Henüz yapamıyorum ama bir çözüm yolu bulabilirim’ cümlesi ise sürecin devam ettiğini hatırlatır. Amaç gerçekleri inkâr etmek değil, zorluğu gelişimci ve eyleme dönük bir dille anlatmaktır.",
    goal: "Bu haftanın sonunda seni kilitleyen cümleleri fark edecek ve onları ‘henüz’ ile başlayan gelişimci komutlara dönüştüreceksin.",
    lesson: [["🛑", "Kilit cümleyi yakala", "‘Yapamam’, ‘Ne anlamı var?’ ve ‘Artık çok geç’ gibi cümleleri fark et."], ["✨", "Henüz gücünü kullan", "Kalıcı bir yargıyı gelişmekte olan bir sürece çevir: ‘Bunu henüz anlamıyorum.’"], ["🧭", "Doğru odağa komut ver", "‘Hata yapma’ yerine ‘Soruyu dikkatle oku’ gibi ne yapacağını söyleyen cümle kur."]],
    steps: ["Zorlandığın anda aklından geçen ilk cümleyi yaz.", "Bu cümlenin seni kilitleyen bölümünü bul.", "Cümleye ‘henüz’ ekleyip eylem gösterecek biçimde yeniden kur.", "Yeni cümleyi yüksek sesle söyle ve ardından küçük bir adım at.", "Bir hafta boyunca en sık kullandığın cümleyi gözlemle."],
    story: { title: "Ormandaki patika nasıl yola dönüşür?", paragraphs: ["Kerem zor bir matematik sorusunda hemen ‘Ben bunu yapamam’ diyordu. Bu cümleden sonra soruya yeniden bakmak yerine kalemi bırakıyor, zihni de daha önce yapamadığı soruları hatırlıyordu.", "Öğretmeni ona cümleyi değiştirmesini önerdi: ‘Bu yöntemi henüz tam bilmiyorum; verilenleri ayırarak başlayabilirim.’ İlk gün yeni cümle biraz yapay geldi. Yine de her söylediğinde soruda atacağı tek adımı seçti.", "Ormandaki yeni bir patika gibi, gelişimci cümle de tekrarlandıkça belirginleşti. Kerem her soruyu çözemiyordu; fakat artık beyni ‘bitti’ yerine ‘sıradaki adım ne?’ sorusuna yöneliyordu."], takeaway: "Olumlu dil, zorluğu yok saymak değildir. Zihnine yapabileceği bir sonraki hareketi göstermek ve öğrenme yolunu açık tutmaktır." },
    task: "Bu hafta seni en çok durduran üç cümleyi yakala; her birini ‘henüz’ ve somut bir sonraki adımla yeniden yaz.",
    fields: [["limiting", "Zorlandığımda kendime en sık hangi cümleyi söylüyorum?", "textarea", "Olduğu gibi yaz."], ["effect", "Bu cümle davranışımı ve dikkatimi nasıl etkiliyor?", "textarea", "Ne yapmana ya da yapmamana yol açıyor?"], ["yet", "Cümlemi ‘henüz’ kullanarak nasıl değiştirebilirim?", "textarea", "Gelişimin sürdüğünü göster."], ["command", "Kendime vereceğim olumlu ve eylem odaklı komut nedir?", "text", "Örnek: Sakin ol, verilenleri sırayla ayır."], ["morning", "Güne başlarken kullanacağım cümle nedir?", "text", "Gerçekçi ve güçlendirici olsun."], ["practice", "Yeni cümleden sonra atacağım küçük adım nedir?", "textarea", "Cümleyi davranışa bağla."]],
    checks: ["Kilit cümlemi dürüstçe fark ettim.", "Cümlenin etkisini yazdım.", "‘Henüz’ ile gelişimci bir cümle kurdum.", "Ne yapacağımı söyleyen olumlu bir komut seçtim.", "Yeni cümleyi küçük bir davranışla eşleştirdim."],
    quiz: { question: "‘Bu konuyu anlamıyorum’ cümlesini gelişimci hâle getiren seçenek hangisidir?", options: ["Bu konu imkânsız.", "Bu konuyu henüz anlamıyorum; örneği adım adım inceleyeceğim.", "Hata yapmamam gerekiyor."], answer: 1, explanation: "‘Henüz’ sürecin açık olduğunu, sonraki adım ise ne yapılacağını gösterir." }
  },
  {
    id: 8, icon: "🌿", title: "Stresle Başa Çıkma ve Motivasyon", short: "Stres alarmını yönet, iç sesini düzenle ve motivasyonunu küçük planlarla inşa et.",
    description: "Stres, gerçek ya da hayali bir tehlike karşısında bedenin verdiği doğal alarmdır. Alarm çok uzun süre açık kaldığında odak, uyku ve motivasyon zorlanabilir. Derin nefes, kas gevşetme, anda kalma ve düşünceyi yeniden çerçeveleme sinir sistemini dengelemeye yardım eder. Motivasyon ise yalnızca beklenen bir his değil; anlamlı hedef, küçük adım ve destekle kurulan bir sistemdir.",
    goal: "Bu haftanın sonunda kendi stres sinyallerini tanıyacak, bir sakinleşme aracı ve küçük bir motivasyon planı hazırlayacaksın.",
    lesson: [["🌬️", "Bedeni sakinleştir", "4 saniye al, 4 saniye tut, 6 saniye ver; bunu beş kez tekrarla."], ["⚪", "Kara sesi beyaz sesle değiştir", "Olumsuz düşünceyi gerçekçi, destekleyici ve çözüm odaklı bir cümleye dönüştür."], ["🏗️", "Motivasyonu inşa et", "Nedenini, kısa hedefini, günlük eylemini ve küçük ödülünü birbirine bağla."]],
    steps: ["Stresin ne zaman ve bedeninin neresinde ortaya çıktığını fark et.", "Diyafram nefesini veya aşamalı kas gevşetmeyi uygula.", "Kara ses cümlesini yakalayıp gerçekçi bir beyaz sesle değiştir.", "Bu hafta için küçük ve ölçülebilir bir hedef seç.", "Zorlandığında yardım isteyeceğin destek kişisini belirle."],
    story: { title: "Zorluk yakıta dönüşebilir mi?", paragraphs: ["Atölye sunumunda anlatılan Mamo Wolde, çok zor koşullarda büyüdü. Koşma hayali çevresindeki insanlar tarafından desteklenmedi; yoksulluk ve alay edilme gibi ağır engellerle karşılaştı.", "O, engellerin yok olmasını beklemedi. Hedefini koruyup yapabildiği antrenmana yöneldi; içindeki öfke ve isteği çalışmaya dönüştürdü. Yolunda destek ve imkân az olsa da küçük adımları sürdürdü.", "Hikâyenin gücü, herkesin aynı sonucu elde etmesinde değil; koşullar zor olduğunda bile kontrol edilebilen bir sonraki adıma dönülebilmesindedir. Yardım istemek ve dinlenmek de bu yolun parçasıdır."], takeaway: "Stresi tamamen yok etmek zorunda değilsin. Bedenini sakinleştirip düşünceni yönlendirerek kontrol edebildiğin küçük adıma dönebilirsin." },
    task: "Yaklaşan bir stres anı için nefes, düşünce, eylem ve destekten oluşan kişisel bir plan hazırla.",
    fields: [["trigger", "Bu hafta beni en çok hangi durum strese sokabilir?", "textarea", "Yaklaşan gerçek bir durumu seç."], ["body", "Stres geldiğinde bedenimde ne hissediyorum?", "textarea", "Kalp atışı, nefes, kaslar, karın..."], ["tool", "O anda hangi sakinleşme aracını kullanacağım?", "text", "Diyafram nefesi, kas gevşetme veya anda kalma."], ["blackVoice", "Kara ses bana ne söylüyor?", "textarea", "Düşünceyi olduğu gibi yaz."], ["whiteVoice", "Bunu gerçekçi bir beyaz sese nasıl çevireceğim?", "textarea", "Destekleyici ama gerçekçi olsun."], ["goal", "Bu haftaki küçük ve ölçülebilir hedefim nedir?", "textarea", "Ne, ne kadar ve ne zamana kadar?"], ["support", "Zorlandığımda kimden yardım isteyebilirim?", "text", "Aile, öğretmen, arkadaş veya rehberlik servisi."]],
    checks: ["Stres kaynağımı belirledim.", "Bedensel sinyalimi fark ettim.", "Bir sakinleşme aracı seçtim.", "Kara sesi beyaz sesle değiştirdim.", "Küçük hedef ve destek kişisi belirledim."],
    quiz: { question: "Stres yükseldiğinde ilk yararlı adım hangisidir?", options: ["Bütün düşünceleri gerçek kabul etmek", "Bedeni sakinleştirip düşünceyi yeniden çerçevelemek", "Yardım istemekten kaçınmak"], answer: 1, explanation: "Beden sakinleştiğinde düşünmek ve çözüm üretmek kolaylaşır." }
  },
  {
    id: 9, icon: "⚙️", title: "Akıllı Çalışma Stratejileri", short: "Motivasyon, ortam, aktif öğrenme, hafıza ve sınav yönetimini tek sistemde birleştir.",
    description: "‘Çalışıyorum ama olmuyor’ cümlesi her zaman öğrencide bir sorun olduğunu göstermez; bazen kullanılan sistem uygun değildir. Akıllı çalışma sistemi dört parçadan oluşur: güç ve ortam, öğrenme teknikleri, hafıza stratejileri ve sınav yönetimi. Pasifçe okumak yerine bilgiyi üretmek; doğru ortamda, yaşına uygun odak bloklarıyla çalışmak gerekir. Sistem düzenli gözlemlenip geliştirilir.",
    goal: "Bu haftanın sonunda kendi çalışma sisteminin dört parçasını inceleyecek ve iyileştireceğin tek bir zayıf halkayı seçeceksin.",
    lesson: [["🔋", "Temel: güç ve ortam", "Kontrol hissi, küçük başarı, destek, sade masa, doğru ışık ve düzenli çalışma köşesi oluştur."], ["🧩", "İşlemci: aktif öğrenme", "İSOAT ile izle-sor-oku-anlat-tekrarla; yapılandırılmış notlarla bilgiyi işle."], ["💾", "Hafıza ve gösterge paneli", "Aralıklı tekrarla depola; sınavda zaman, soru ve panik kontrolünü yönet."]],
    steps: ["Sisteminin dört parçasına 1–5 arasında puan ver.", "En düşük puanlı tek parçayı seç.", "Bu parça için uygulanabilir bir değişiklik belirle.", "Değişikliği bir hafta boyunca küçük bir deneyle uygula.", "Sonuçta neyin işe yaradığını kaydet ve sistemi güncelle."],
    story: { title: "Sorun öğrencide değil, sistemde olabilir", paragraphs: ["Azra her akşam uzun süre masada oturuyor ama ertesi gün pek azını hatırlıyordu. Çalışma süresini artırdıkça yoruluyor; yine de ‘Demek ki yeterince iyi değilim’ diye düşünüyordu.", "Sistemini incelediğinde masasında telefon bulunduğunu, yalnızca altını çizerek okuduğunu ve tekrar günü belirlemediğini fark etti. Önce çalışma köşesini sadeleştirdi, sonra İSOAT yönteminde kitabı kapatıp anlatma adımını kullandı ve kısa tekrar tarihleri ekledi.", "Azra’nın zekâsı bir haftada değişmedi; kullandığı sistem değişti. Süreyi artırmadan daha çok hatırlamaya başladı ve hangi parçanın sorun çıkardığını gözlemlemeyi öğrendi."], takeaway: "Kendini suçlamadan önce sistemi incele. En zayıf halkada yapacağın küçük ve ölçülebilir değişiklik bütün çalışmayı güçlendirebilir." },
    task: "Kendi çalışma sisteminin dört parçasını değerlendir, en zayıf halkayı seç ve bir haftalık iyileştirme deneyi yap.",
    fields: [["power", "Motivasyon ve destek sistemime 1–5 arasında kaç puan veririm? Neden?", "textarea", "Kontrol, küçük başarı ve destek açısından düşün."], ["environment", "Çalışma ortamımda değiştireceğim tek şey nedir?", "textarea", "Masa, telefon, ışık, hava veya çalışma köşesi."], ["active", "Pasif okumayı hangi aktif yöntemle değiştireceğim?", "textarea", "İSOAT, anlatma, soru üretme veya Cornell notu."], ["memory", "Bilgiyi kalıcı tutmak için tekrar takvimim nedir?", "textarea", "En az üç tekrar zamanı yaz."], ["exam", "Sınav gösterge panelimde kullanacağım strateji nedir?", "textarea", "Zaman, soru sırası veya panik kontrolü."], ["weakLink", "Sistemimin en zayıf halkası ve bu haftaki deneyim nedir?", "textarea", "Tek bir değişiklik seç."]],
    checks: ["Sistemimin dört parçasını değerlendirdim.", "En zayıf halkayı seçtim.", "Pasif çalışma yerine aktif bir yöntem belirledim.", "Tekrar zamanı ekledim.", "Bir haftalık küçük deney planladım."],
    quiz: { question: "Akıllı çalışma sisteminde pasif okumayı aktif öğrenmeye çeviren davranış hangisidir?", options: ["Metni düşünmeden tekrar okumak", "Kitabı kapatıp konuyu kendi cümlelerinle anlatmak", "Çalışma süresini sınırsız uzatmak"], answer: 1, explanation: "Bilgiyi hatırlayıp üretmek, beynin bilgiyi işlemesini sağlar." }
  },
  {
    id: 10, icon: "🏆", title: "Sınavda Başarı Teknikleri", short: "Hazırlık, zaman, odak, ders stratejisi ve hata analizini tek sınav planında birleştir.",
    description: "Sınav başarısı yalnızca ne bildiğinle değil, bildiğini baskı altında ne kadar doğru kullanabildiğinle ilgilidir. Düzenli uyku, hafif tekrar ve hazırlanan ekipman sınav öncesi zihni rahatlatır. Sınav sırasında turlama, soru kökünü işaretleme, eleme ve kısa reset teknikleri zaman ve odağı korur. Deneme sonrasında hata analizi yapmak ise her sınavı yeni bir öğrenme fırsatına dönüştürür.",
    goal: "Bu haftanın sonunda sınav öncesi, sınav anı ve sınav sonrası için kişisel bir başarı protokolü hazırlayacaksın.",
    lesson: [["🎒", "Önce ekipmanı kuşan", "Son gün yeni konu yüklemek yerine hafif tekrar yap; yaklaşık 8 saat uyu, kahvaltı ve sınav araçlarını hazırla."], ["🧭", "Sınavda turla ve odaklan", "Önce kolay soruları çöz; zorları işaretleyip geç, soru kökündeki kilit ifadelerin altını çiz."], ["🔍", "Sonra hatanı analiz et", "Bilgi eksiği, dikkatsizlik, zaman veya yöntem sorununu ayır ve doğru çözümü öğren."]],
    steps: ["Sınavdan önceki gün için hafif tekrar, uyku ve ekipman planı yap.", "İlk turda kolay soruları çöz; 90–120 saniyede ilerleyemediğin soruyu işaretleyip geç.", "Tüm seçenekleri oku ve yanlış olanları eleyerek karar ver.", "Panikte kalemi bırak, gözlerini kısa süre kapat, nefes al ve önündeki soruya dön.", "Sınavdan sonra yanlış ve boşları nedenlerine göre gruplandır."],
    story: { title: "Deneme sonucu neden bir karar değil, haritadır?", paragraphs: ["Eren ilk denemesinde beklediğinden düşük sonuç aldı. Yalnızca puana bakınca bütün çalışmasının boşa gittiğini düşündü. Oysa kâğıdı ayrıntılı incelediğinde yanlışlarının çoğunun iki paragraf soru türünde ve sürenin son bölümünde toplandığını gördü.", "Bir sonraki denemede önce kolay soruları çözmek için turlama kullandı. Soru kökündeki ‘değildir’ ve ‘en önemlidir’ gibi ifadeleri işaretledi; zor soruda iki dakikadan fazla kaldığında yanına işaret koyup geçti.", "Deneme artık Eren için yargı değil, sonraki antrenmanı gösteren bir haritaydı. Yanlışların nedenini ayırdıkça hem çalışacağı konuyu hem sınavda kullanacağı stratejiyi daha doğru seçti."], takeaway: "Sınav sonucu kim olduğunu söylemez. Hangi bilgiyi ve hangi sınav becerisini geliştireceğini gösteren kanıttır." },
    task: "Yaklaşan sınav için hazırlık, turlama, panik reseti, ders taktiği ve hata analizinden oluşan kişisel protokolünü yaz.",
    fields: [["exam", "Hazırlandığım sınav ve tarihi nedir?", "text", "Sınav adı ve tarih."], ["dayBefore", "Sınavdan bir gün önce ne yapacağım?", "textarea", "Hafif tekrar, uyku, dinlenme ve ekipman."], ["tour", "İlk ve ikinci tur stratejim nasıl olacak?", "textarea", "Kolay, zor ve işaretli sorular."], ["reset", "Panik veya dikkat kopuşunda reset adımlarım neler?", "textarea", "Nefes ve yeniden odaklanma planı."], ["subject", "En çok zorlandığım ders için özel taktiğim nedir?", "textarea", "Türkçe, matematik, fen, sosyal veya İngilizce."], ["analysis", "Sınavdan sonra hatalarımı hangi başlıklarda ayıracağım?", "textarea", "Bilgi, dikkat, zaman, işlem veya seçenek kararsızlığı."], ["promise", "Sınav anında kendime söyleyeceğim cümle nedir?", "text", "Gerçekçi ve sakinleştirici bir cümle."]],
    checks: ["Sınav öncesi hazırlık planımı yaptım.", "Turlama tekniğimi belirledim.", "Soru kökünü ve seçenekleri dikkatle okuma kuralını ekledim.", "Panik için kısa reset planım var.", "Sınav sonrası hata analizi başlıklarımı belirledim."],
    quiz: { question: "Zor bir soruda 90–120 saniye ilerleyemiyorsan en iyi strateji hangisidir?", options: ["Bütün süreni o soruda harcamak", "Soruyu işaretleyip kolaylar bittikten sonra geri dönmek", "Sınavı bırakmak"], answer: 1, explanation: "Turlama tekniği zamanı korur ve kolay sorulardan psikolojik momentum kazanmanı sağlar." }
  }
];

const MODULE_ANECDOTES = {
  1: {
    title: "Deniz’in dolu ajandası",
    paragraphs: [
      "Deniz, pazartesi akşamı yeni aldığı ajandasını açtı ve o hafta yapması gereken her şeyi tek tek yazdı. Matematikten iki konu, Türkçeden yüz soru, fen projesi, İngilizce kelimeler ve kitap okuma… Sayfa doldukça kendini çalışkan hissediyordu. Fakat görevlerin hangi gün ve ne kadar süreyle yapılacağı belli değildi. Salı günü okuldan yorgun gelince listenin büyüklüğünü gördü, nereden başlayacağını seçemedi ve ajandayı kapattı.",
      "Ertesi gün öğretmeni ona bütün haftayı bir kerede çözmeye çalışmamasını söyledi. Deniz önce en önemli iki işi seçti: cuma günkü fen projesi ve zorlandığı kesirler konusu. Fen projesini üç küçük parçaya böldü; araştırma, taslak ve düzenleme. Kesirler için de çarşamba ve cumartesi günlerine 25’er dakika ayırdı. Her günün yanına kısa bir dinlenme zamanı ekledi.",
      "Hafta bittiğinde listedeki her şeyi tamamlamamıştı ama önemli işlerini zamanında yapmıştı. İlk kez planın, bütün boşlukları görevlerle doldurmak olmadığını anladı. İyi bir plan geleceği kusursuz biçimde tahmin etmez; neye önce başlayacağını gösterir ve yorulduğunda yeniden yolunu bulmana yardım eder."
    ],
    takeaway: "Planın gücü, çok görev yazmaktan değil; önemli işi doğru güne ve uygulanabilir bir süreye yerleştirmekten gelir."
  },
  2: {
    title: "Elif’in kaybolan yirmi dakikası",
    paragraphs: [
      "Elif, sosyal bilgiler ödevini bitirmek için masaya oturduğunda telefonunu sessize aldı. Telefon masanın köşesindeydi. Ekran her yandığında yalnızca kimin yazdığına bakacağını düşünüyordu. İlk bildirime birkaç saniye baktı, sonra ödevine döndü. Fakat kaldığı cümleyi yeniden okuması gerekti. İkinci bildirimde bir arkadaşının mesajına cevap verdi. Yirmi dakika sonra defterinde yalnızca iki cümle vardı.",
      "Elif önce kendisine kızdı ve dikkatinin çok kötü olduğunu düşündü. Sonra sorununu gözlemlemeye karar verdi. Telefonu salondaki çekmeceye bıraktı, masasında yalnızca kitabını ve kalemini tuttu. Kendisine ‘Sadece 20 dakika bu başlığı bitireceğim.’ dedi. Aklına başka bir şey geldiğinde hemen yapmak yerine küçük bir kâğıda not etti.",
      "Sayaç çaldığında bütün ödev bitmemişti ama bir sayfayı gerçekten anlayarak tamamlamıştı. Elif, dikkatin yalnızca güçlü bir irade meselesi olmadığını fark etti. Çevresinde gördüğü ve duyduğu şeyler beynine sürekli yeni görevler sunuyordu. Ortamını düzenlediğinde zihninin tek işe dönmesi kolaylaşıyordu."
    ],
    takeaway: "Dikkatini korumak için kendinle savaşmak zorunda değilsin; çevreni tek işi destekleyecek biçimde düzenleyebilirsin."
  },
  3: {
    title: "Zeynep’in unuttuğunu sandığı konu",
    paragraphs: [
      "Zeynep, fen sınavından önce Güneş Sistemi konusuna iki saat çalıştı. Kitabı birkaç kez okudu, önemli cümlelerin altını çizdi ve o akşam her şeyi bildiğini düşündü. Üç gün sonra arkadaşı gezegenlerin sırasını sorunca iki gezegeni karıştırdı. ‘Bunca saat çalıştım, yine unutmuşum.’ diyerek moralini bozdu.",
      "Öğretmeni, unutmanın öğrenmenin düşmanı değil doğal bir parçası olduğunu anlattı. Zeynep bu kez konuyu kapatıp hatırladıklarını boş bir kâğıda yazdı. Ertesi gün beş dakika gezegen kartlarını sıraladı. Üç gün sonra notlarına bakmadan konuyu kardeşine anlattı ve on soru çözdü. Yanlış yaptığı iki soruyu işaretleyip hafta sonunda yeniden denedi.",
      "Bir hafta sonra bütün cümleleri ezbere söyleyemiyordu; fakat gezegenlerin sırasını ve özelliklerini kendi sözleriyle açıklayabiliyordu. Uzun süre kitaba bakmanın kendisine tanıdıklık hissi verdiğini, asıl öğrenmenin ise bilgiyi zihninden geri çağırırken gerçekleştiğini gördü. Kısa tekrarlar, her dönüşte bilgiyi biraz daha sağlamlaştırmıştı."
    ],
    takeaway: "Tekrar, aynı sayfayı yeniden okumak değil; bilgiyi farklı günlerde hatırlamaya çalışmak ve kendini sınamaktır."
  },
  4: {
    title: "Arda’nın yetişmeyen notları",
    paragraphs: [
      "Arda, öğretmen konuşurken duyduğu her cümleyi defterine geçirmek istiyordu. Bir cümleyi yazarken öğretmen yeni bir bilgiye geçiyor, Arda başını kaldırdığında konunun bağlantısını kaçırıyordu. Defteri sayfalarca yazıyla doluydu ama sınavdan önce hangi bilginin önemli olduğunu bulmak uzun sürüyordu. Notlarının çok olması ona güven veriyor, yine de konuyu anlatması istendiğinde zorlanıyordu.",
      "Bir derste farklı bir yöntem denedi. Sayfanın ortasına konunun adını yazdı. Öğretmenin tekrar ettiği kavramları anahtar kelime olarak ekledi; her kelimenin yanına kısa bir açıklama ve kendi bulduğu bir örnek koydu. Anlamadığı yere soru işareti çizdi. Ders bitince iki dakika ayırıp sayfanın altına ‘Bugün ne öğrendim?’ başlığıyla üç cümle yazdı.",
      "Akşam notlarına baktığında bütün dersin kelimesi kelimesine yazılı olmadığını gördü. Buna rağmen anahtar kelimeler ona konunun akışını hatırlatıyordu. Soru işareti koyduğu yeri öğretmenine sordu ve eksik bağlantıyı tamamladı. Arda, iyi notun dersin kopyası olmadığını; zihnin anlayabileceği bir harita olduğunu fark etti."
    ],
    takeaway: "İşe yarayan not, en çok yazıyı değil; ana düşünceyi, bağlantıları, kendi cümleni ve hatırlatıcı bir örneği içerir."
  },
  5: {
    title: "Selin’in kaçırdığı küçük ayrıntı",
    paragraphs: [
      "Selin, okul gezisiyle ilgili duyuruyu hızlıca okudu. Metinde buluşma saati, getirilecek malzemeler ve hava durumuna göre yapılacak değişiklikler anlatılıyordu. Selin yalnızca gezi yerini hatırladı. Ertesi sabah okula normal saatinde geldiğinde grubun daha erken toplandığını öğrendi. Duyuruyu okuduğundan emindi ama önemli bilgiyi zihninde tutamamıştı.",
      "O gün metinleri bitirmek için değil anlamak için okumayı denedi. Önce başlığa baktı ve metnin ne anlatacağını tahmin etti. Her paragraftan sonra durup ‘Bu bölümün görevi neydi?’ diye sordu. Bir kenara yalnızca bir anahtar kelime yazdı: saat, malzeme, değişiklik. Sonunda metni kapatarak üç kelime üzerinden duyuruyu kendi cümleleriyle anlattı.",
      "Selin, gözlerinin bütün satırların üzerinden geçmesinin anlamak için yeterli olmadığını gördü. Okurken zihnin de metinle konuşması gerekiyordu. Konuyu, ana fikri ve ayrıntıların görevini düşündüğünde bilgiler birbirine bağlanıyordu. Yavaşlamak her zaman daha uzun sürmüyor; bazen metni ikinci kez okumak zorunda kalmayı önlüyordu."
    ],
    takeaway: "Anlamak, metni bitirdiğinde değil; metnin ne söylediğini ve neden söylediğini kendi cümlelerinle açıklayabildiğinde gerçekleşir."
  },
  6: {
    title: "Can’ın kırmızı işaretleri",
    paragraphs: [
      "Can, matematik testini kontrol ettiğinde üç yanlışının yanına kırmızı çarpı koydu ve hemen yeni teste geçti. Yanlış sorulara bakmak ona başarısız olmuş gibi hissettiriyordu. Bir hafta sonra benzer sorularda yine aynı hataları yaptı. Doğru sayısı artmadığı için daha fazla soru çözmesi gerektiğini düşündü; fakat çözdüğü soru sayısı arttıkça aynı yanlışlar da tekrarlanıyordu.",
      "Öğretmeni üç yanlışı masaya koyup her biri için farklı bir soru sordu: ‘Konuyu mu bilmiyordun, soruyu mu hızlı okudun, yoksa işlem sırasında mı hata yaptın?’ Can ilk soruda bir kavramı karıştırdığını, ikincide ‘değildir’ kelimesini görmediğini, üçüncüde ise çıkarma işlemini yanlış yaptığını fark etti. Her yanlışın yanına nedenini ve bir sonraki adımını yazdı.",
      "Can, konu eksiği için kısa bir anlatıma döndü; dikkat hatasında soru kökünü işaretledi; işlem hatası için çözümünü son kez kontrol etti. Sonra her türden iki benzer soru çözdü. Yanlış sayısı bir anda sıfırlanmadı ama artık her yanlış ona ne yapacağını söylüyordu. Kırmızı çarpılar yargı değil, çalışma yönünü gösteren işaretlere dönüşmüştü."
    ],
    takeaway: "Yanlışın değerli hâle gelmesi için yalnızca doğru cevabı görmek değil, hatanın nedenini bulup yeni bir davranış seçmek gerekir."
  },
  7: {
    title: "Defne’nin aynı görünen iki puanı",
    paragraphs: [
      "Defne iki deneme sınavından da birbirine yakın puan aldı. İlk bakışta hiç ilerlemediğini düşündü ve bütün derslere daha uzun çalışmaya karar verdi. Sonra sonuç kâğıtlarını yan yana koydu. İlk denemede matematikte konu eksiği fazlaydı; ikinci denemede matematik doğruları artmış ama Türkçenin son sorularına zamanı yetmemişti. Aynı puanın arkasında iki farklı hikâye vardı.",
      "Defne yanlışlarını derslere ve nedenlerine göre ayırdı. Türkçede uzun paragraflarda hız kaybettiğini, fende iki soruyu dikkatsiz okuduğunu, matematikte kesirler konusunun düzeldiğini gördü. Kendisine üç hedef seçti: haftada iki gün süreli paragraf çalışmak, fen sorularında soru kökünü işaretlemek ve güçlenen matematik konusunu kısa tekrarlarla korumak.",
      "Sonraki denemeye girerken amacı yalnızca daha yüksek puan almak değildi. Zamanını hangi bölümde kontrol edeceğini ve yanlış yaptığında neyi inceleyeceğini biliyordu. Deneme sonucu artık tek bir sayı olmaktan çıkmıştı. Defne’ye hangi becerinin geliştiğini, hangisinin destek istediğini ve bir sonraki hafta ne yapacağını gösteren ayrıntılı bir yol haritasıydı."
    ],
    takeaway: "Deneme analizi, puanı görmekle bitmez; sonuçtan ders, konu, hata nedeni ve yeni çalışma adımı çıkardığında tamamlanır."
  },
  8: {
    title: "Bora’nın sınavdan önceki alarmı",
    paragraphs: [
      "Bora evde soruları çözebiliyor fakat sınav kâğıdı önüne geldiğinde kalbinin hızlandığını hissediyordu. ‘Ya bildiklerimi unutursam?’ düşüncesi aklına gelince ilk soruya tekrar tekrar bakıyor, zamanın geçtiğini fark ettikçe daha çok geriliyordu. Bu durumu bilgisiz olduğunun kanıtı sandığı için kaygılandığını kimseye söylemek istemiyordu.",
      "Rehber öğretmeni bedenindeki belirtilerin bir alarm sistemi gibi çalıştığını anlattı. Alarm tehlike var demek zorunda değildi; Bora’nın sınava önem verdiğini de gösterebilirdi. Bir plan hazırladılar: ayaklarını yere hissetmek, üç kez yavaş nefes vermek, kendisine ‘Heyecanlı olsam da bildiğim adımları uygulayabilirim.’ demek ve önce yapabildiği bir soruyla başlamak.",
      "Sonraki sınavda kalbi yine hızlandı. Bora bu kez heyecanın tamamen geçmesini beklemedi. Planındaki adımları uygulayıp kolay gördüğü sorudan başladı. Birkaç dakika sonra sınavın ritmine girdi. Kaygıyı yenmesi gereken bir düşman gibi değil, yönlendirebileceği güçlü bir duygu gibi görmeye başladı. Hazırlık ve doğru iç konuşma ona kontrol edebileceği küçük bir alan açmıştı."
    ],
    takeaway: "Amaç hiç heyecanlanmamak değil; heyecan geldiğinde bedenini sakinleştiren ve dikkatini yapabileceğin adıma taşıyan bir plan kullanmaktır."
  },
  9: {
    title: "İpek’in görünmeyen boşlukları",
    paragraphs: [
      "İpek okuldan sonra hiçbir şeye zamanı kalmadığını söylüyordu. Eve geliyor, biraz dinleniyor, mesajlara bakıyor ve yemek yiyordu. Dersin başına oturduğunda saat ilerlemiş oluyor, uzun bir çalışma için geç kaldığını düşünüp erteliyordu. Günleri yoğun görünüyordu ama zamanın tam olarak nereye gittiğini bilmiyordu.",
      "Bir gün yalnızca gözlem yapmak için okuldan uyuyana kadar yaptığı işleri saatleriyle yazdı. Telefonu kısa kısa kontrol ettiği zamanların toplamda bir saate yaklaştığını gördü. Ayrıca yemek öncesinde 25 dakikalık, akşam da 20 dakikalık iki boşluğu vardı. Bütün akşamı derse çevirmek yerine bu boşluklardan birini zorlandığı konuya ayırdı; diğerini dinlenme ve oyun için korudu.",
      "İpek’in günü uzamamıştı, yine de önemli bir işi tamamlayabilmişti. Zaman yönetiminin her dakikayı doldurmak olmadığını anladı. Hangi saatlerde daha enerjik olduğunu bilmek, küçük boşlukları görmek ve eğlenceye de sınırı belli bir yer ayırmak gününü daha sakin hâle getiriyordu. ‘Vaktim yok.’ cümlesi yerini ‘Hangi küçük aralığı kullanabilirim?’ sorusuna bıraktı."
    ],
    takeaway: "Zamanı yönetmek daha çok saat bulmak değil; elindeki saatlerin nereye gittiğini görüp önemli işe gerçekçi bir yer açmaktır."
  },
  10: {
    title: "Kerem’in belirsiz hedefi",
    paragraphs: [
      "Kerem her pazartesi ‘Bu hafta matematiğimi geliştireceğim.’ diyordu. Cümle ona iyi hissettiriyor fakat salı günü ne yapacağına karar veremiyordu. Bazen çok uzun bir test seçiyor, yarısında bırakıyordu. Hafta sonunda gelişip gelişmediğini anlayamıyor ve hedef koymanın kendisinde işe yaramadığını düşünüyordu.",
      "Öğretmeni hedefini görünür ve ölçülebilir hâle getirmesini istedi. Kerem ‘Dört gün boyunca kesirlerden 15 soru çözeceğim ve yanlışlarımı defterime yazacağım.’ dedi. Günleri pazartesi, salı, perşembe ve cumartesi olarak seçti. Her çalışmanın yanına küçük bir kutu çizdi. İlk gün 15 soru fazla gelince hedefi 10 soruya küçülttü; hedefi bırakmak yerine uygulanabilir hâle getirdi.",
      "Cumartesi günü dört kutudan üçünü işaretlemişti. Kusursuz bir hafta değildi ama elinde gerçek bir sonuç vardı: 30 soru, beş incelenmiş yanlış ve daha iyi anladığı bir konu. Kerem, hedefin kendisine verilen sert bir emir olmadığını fark etti. İyi hedef, ilerlemeyi görmesini sağlayan ve gerektiğinde yeniden düzenleyebildiği bir yön tabelasıydı."
    ],
    takeaway: "Güçlü hedef; ne yapacağını, ne kadar yapacağını, ne zaman yapacağını ve ilerlediğini nasıl anlayacağını açıkça söyler."
  }
};

const MODULE_EXTRAS = {
  1: {
    duration: "12–15 dk.",
    warmup: "Geçen hafta yapmak isteyip de ertelediğin bir ders görevi oldu mu? Sence başlamanı zorlaştıran neydi?",
    steps: ["Bu haftaki derslerini ve sorumluluklarını listele.", "En önemli iki önceliğini seç.", "Görevleri 20–30 dakikalık küçük parçalara böl.", "Planında mola ve beklenmedik durumlar için boşluk bırak."],
    powerTip: "Planına yüzde 80 doluluk hedefi koy. Her dakikayı doldurmazsan planın daha esnek ve uygulanabilir olur.",
    commonMistake: "Bir güne çok fazla görev yazmak. Yapamadığında plan kötü değildir; yalnızca küçültülmeye ihtiyacı vardır.",
    quiz: { question: "Aşağıdakilerden hangisi uygulanabilir bir plan örneğidir?", options: ["Cumartesi bütün konuları bitireceğim.", "Salı 18.00'de 25 dakika paragraf çözeceğim.", "Her gün çok uzun çalışacağım."], answer: 1, explanation: "Net gün, saat, süre ve görev içeren planları uygulamak daha kolaydır." }
  },
  2: {
    duration: "10–12 dk.",
    warmup: "Son çalışmanda dikkatin ilk kez ne zaman dağıldı? O anda çevrende veya aklında ne vardı?",
    steps: ["Seni en çok bölen üç şeyi fark et.", "Çalışma alanından bir dikkat dağıtıcıyı çıkar.", "20 dakikalık tek görev seç.", "Süre bitince kısa bir mola ver ve kendini değerlendir."],
    powerTip: "Telefonu sessize almak yerine başka bir odaya koymak, onu kontrol etme isteğini belirgin biçimde azaltabilir.",
    commonMistake: "Aynı anda müzik, mesaj ve dersle ilgilenmeye çalışmak. Beyin görevler arasında geçerken zaman ve enerji kaybeder.",
    quiz: { question: "Dikkatini korumak için en güçlü ilk adım hangisidir?", options: ["Telefonu masada ters çevirmek", "Bildirim gelince kısa bakmak", "Telefonu görüş alanından çıkarmak"], answer: 2, explanation: "Görüş alanında olmayan bir dikkat dağıtıcıyı kontrol etme isteği genellikle daha az olur." }
  },
  3: {
    duration: "12–15 dk.",
    warmup: "Bir konuyu çalıştıktan birkaç gün sonra unuttuğunu fark ettiğin oldu mu? O konuyu nasıl tekrar etmiştin?",
    steps: ["Ders bitince konuyu üç cümleyle özetle.", "Ertesi gün notlara bakmadan hatırlamayı dene.", "Üç gün sonra birkaç soru çöz.", "Bir hafta sonra kendine küçük bir test uygula."],
    powerTip: "Tekrar sırasında önce hafızandan anlat, sonra notunu aç. Hatırlamaya çalışmak öğrenmeyi güçlendirir.",
    commonMistake: "Aynı notu tekrar tekrar yalnızca okumak. Etkili tekrar, bilgiyi hatırlamaya çalışmayı ve soru çözmeyi içerir.",
    quiz: { question: "Hangi tekrar yöntemi bilgiyi daha kalıcı yapar?", options: ["Konuyu bir gecede üç kez okumak", "Farklı günlerde kısa tekrarlar yapmak", "Sadece sınav sabahı göz atmak"], answer: 1, explanation: "Aralıklı tekrar, unutmaya başladığın bilgiyi yeniden güçlendirir." }
  },
  4: {
    duration: "15–18 dk.",
    warmup: "Bir sayfa dolusu not mu, yoksa anahtar kelimelerle hazırlanmış kısa bir özet mi sana daha çok yardımcı olur? Neden?",
    steps: ["Konunun başlığını ve temel sorusunu yaz.", "En önemli üç bilgiyi seç.", "Bilgiyi kendi cümlelerinle kısalt.", "Bir örnek, sembol veya küçük soru ekle."],
    powerTip: "Sayfanın sonunda iki satırlık “Ben ne öğrendim?” kutusu bırak. Tekrar ederken önce bu kutuya bak.",
    commonMistake: "Öğretmenin söylediği her cümleyi yazmaya çalışmak. Seçmeden yazmak, dinlemeyi ve anlamayı zorlaştırabilir.",
    quiz: { question: "İyi bir ders notunda hangisi bulunmalıdır?", options: ["Her cümlenin aynısı", "Yalnızca renkli başlıklar", "Anahtar kelimeler ve kendi cümlelerin"], answer: 2, explanation: "Seçilmiş anahtar kelimeler ve kendi cümlelerin, konuyu gerçekten anlamana yardım eder." }
  },
  5: {
    duration: "15–20 dk.",
    warmup: "Bir metni bitirdiğinde kendine ilk hangi soruyu soruyorsun: “Ne anlatıldı?” mı, “Kaç satırdı?” mı?",
    steps: ["Başlığa bak ve metnin ne hakkında olacağını tahmin et.", "Okurken önemli kelimeleri fark et.", "Her bölüm için kısa bir anahtar kelime seç.", "Metni kapatıp ana fikri kendi cümlenle söyle."],
    powerTip: "Ana fikir çoğu zaman metindeki bütün örnekleri bir araya getiren genel düşüncedir; tek bir ayrıntı değildir.",
    commonMistake: "Ana fikir yerine metindeki ilginç bir ayrıntıyı yazmak. Kendine “Yazar bu metni neden yazdı?” diye sor.",
    quiz: { question: "Ana fikir neyi anlatır?", options: ["Metindeki tek bir ayrıntıyı", "Yazarın asıl vermek istediği düşünceyi", "Metnin kaç paragraf olduğunu"], answer: 1, explanation: "Ana fikir, metnin bütününü kapsayan temel mesajdır." }
  },
  6: {
    duration: "12–15 dk.",
    warmup: "Yanlış yaptığın bir soruyu gördüğünde ilk tepkin ne oluyor: geçmek, silmek, yoksa nedenini aramak mı?",
    steps: ["Yanlış soruyu yeniden ve yavaşça oku.", "Hatanın türünü belirle: konu, dikkat, işlem veya zaman.", "Doğru çözümü kendi cümlenle açıkla.", "Aynı beceriyi ölçen iki benzer soru çöz."],
    powerTip: "Bir “hata günlüğü” oluştur. Yalnızca yanlış cevabı değil, bir dahaki sefere yapacağın değişikliği de yaz.",
    commonMistake: "Doğru seçeneği görüp hemen geçmek. Çözümün neden doğru olduğunu açıklayamıyorsan öğrenme henüz tamamlanmamıştır.",
    quiz: { question: "Bir yanlış sorudan sonra en yararlı adım hangisidir?", options: ["Soruyu silmek", "Hata nedenini belirleyip benzer soru çözmek", "Sadece doğru cevabı ezberlemek"], answer: 1, explanation: "Nedeni bulmak ve benzer soru çözmek, aynı hatayı azaltmana yardım eder." }
  },
  7: {
    duration: "18–22 dk.",
    warmup: "Son denemenden sonra yalnızca puanına mı baktın, yoksa yanlışlarının hangi konulardan geldiğini de inceledin mi?",
    steps: ["Derslerin doğru ve yanlış sayılarını ayrı yaz.", "Yanlışları konu ve hata türüne göre grupla.", "Zaman kullanımını değerlendir.", "Sonraki denemeye kadar çalışacağın üç öncelik belirle."],
    powerTip: "En düşük netli ders her zaman ilk öncelik olmayabilir. Kısa çalışmayla hızlı gelişebileceğin konuya da bak.",
    commonMistake: "Sadece toplam puanı karşılaştırmak. Aynı puanın arkasında farklı konu eksikleri ve zaman sorunları olabilir.",
    quiz: { question: "Deneme analizi ne zaman tamamlanmış sayılır?", options: ["Puanı öğrendiğinde", "Arkadaşınla karşılaştırdığında", "Sonuçtan yeni çalışma hedefleri çıkardığında"], answer: 2, explanation: "Deneme, bir sonraki çalışma adımını gösterdiğinde gerçek bir yol haritasına dönüşür." }
  },
  8: {
    duration: "12–15 dk.",
    warmup: "Sınav öncesi heyecanlandığında bedeninde ilk neyi fark ediyorsun? Bu belirti sana ne söylüyor olabilir?",
    steps: ["Kaygının bedenindeki işaretini fark et.", "Nefesini yavaşlat ve ayaklarını yere hisset.", "Kendine gerçekçi, destekleyici bir cümle söyle.", "Bildiğin bir soruyla başlayıp ritmini kur."],
    powerTip: "“Hiç kaygılanmamalıyım” demek yerine “Heyecanlı olsam da adım adım ilerleyebilirim” cümlesini dene.",
    commonMistake: "Kaygıyı tehlike işareti sanmak. Bir miktar heyecan, senin bu sınava önem verdiğini ve hazırlandığını gösterebilir.",
    quiz: { question: "Kaygı yükseldiğinde hangi cümle daha destekleyicidir?", options: ["Kesin her şeyi unutacağım.", "Heyecanlıyım ama bildiğim adımları uygulayabilirim.", "Kaygılanırsam sınavım kötü geçer."], answer: 1, explanation: "Gerçekçi ve destekleyici iç konuşma, dikkatini yapabileceğin adımlara taşır." }
  },
  9: {
    duration: "12–15 dk.",
    warmup: "Bugün okuldan sonra zamanın en çok hangi etkinliğe gitti? Bu seçiminden memnun musun?",
    steps: ["Sabit saatlerini yaz: okul, yemek, uyku.", "Boş zaman aralıklarını fark et.", "En verimli saatine önemli bir görev yerleştir.", "Ders, mola ve eğlence sürelerini dengeli biçimde sınırla."],
    powerTip: "Bir işe başlayacağın saati yazmak, yalnızca “bugün yapacağım” demekten daha etkilidir.",
    commonMistake: "Mola vermeden uzun süre çalışmayı verimli sanmak. Zihnin kısa ve planlı molalarla daha iyi toparlanır.",
    quiz: { question: "Zaman yönetiminin temel amacı nedir?", options: ["Her dakikayı dersle doldurmak", "Daha az dinlenmek", "Önemli işlere uygun zamanda yer açmak"], answer: 2, explanation: "Zaman yönetimi; ders, dinlenme ve eğlence arasında bilinçli bir denge kurmaktır." }
  },
  10: {
    duration: "12–15 dk.",
    warmup: "“Derslerimde daha iyi olacağım” hedefini ölçmek mümkün mü? Bu hedefi nasıl daha açık hâle getirirdin?",
    steps: ["Geliştirmek istediğin tek bir alan seç.", "Hedefini sayı, süre veya tarih ile netleştir.", "Her gün uygulayacağın küçük adımı belirle.", "Hafta sonunda sonucunu değerlendir ve gerekirse hedefi güncelle."],
    powerTip: "Hedefin sana biraz meydan okumalı ama ulaşılmaz görünmemeli. Yüzde 70–80 başarı olasılığı iyi bir dengedir.",
    commonMistake: "Sonucu hedefleyip süreci yazmamak. “20 doğru yapmak” sonuçtur; “dört gün 15 soru çözmek” ise seni sonuca götüren süreçtir.",
    quiz: { question: "Hangisi ölçülebilir bir hedeftir?", options: ["Matematikte daha iyi olacağım.", "Bu hafta dört gün 15 problem çözeceğim.", "Çok çalışacağım."], answer: 1, explanation: "Gün ve soru sayısı belli olduğu için ilerlemeyi kolayca takip edebilirsin." }
  }
};

const ACTIVITY_LABS = {
  1: { icon: "🗂️", title: "Planlama Karar Laboratuvarı", instruction: "Her görevi en uygun planlama kararına yerleştir.", categories: ["Önce yap", "Planla", "Küçült"], items: [["Yarın teslim edilecek Türkçe ödevi", "Önce yap", "Yakın tarihli ve önemli görev önceliklidir."], ["Bir ay sonraki proje için kaynak bulmak", "Planla", "Acil değil ama takvime eklenirse unutulmaz."], ["Bir günde 200 soru çözmek", "Küçült", "Büyük görevler uygulanabilir parçalara bölünmelidir."]], mission: "Bu hafta planındaki en az bir küçük görevi zamanında tamamla." },
  2: { icon: "🛡️", title: "Dikkat Kalkanı Atölyesi", instruction: "Her duruma en uygun dikkat koruma kararını ver.", categories: ["Uzaklaştır", "Azalt", "Sorun değil"], items: [["Masada bildirimleri açık telefon", "Uzaklaştır", "Telefonu görüş alanından çıkarmak güçlü bir önlemdir."], ["Yan odadan gelen konuşma sesi", "Azalt", "Kapıyı kapatmak veya sakin alan seçmek yardımcı olabilir."], ["Çözeceğin test ve kalemin masada olması", "Sorun değil", "Görev için gerekli malzemeler dikkat dağıtıcı değildir."]], mission: "Dört çalışma oturumunda telefonunu görüş alanından çıkar." },
  3: { icon: "🧠", title: "Tekrar Dedektifi", instruction: "Tekrar yöntemlerinin etkili olup olmadığına karar ver.", categories: ["Etkili", "Geliştir"], items: [["Notu kapatıp konuyu kendi cümlelerinle anlatmak", "Etkili", "Hatırlamaya çalışmak öğrenmeyi güçlendirir."], ["Aynı sayfayı arka arkaya beş kez okumak", "Geliştir", "Sadece okumak yerine kendini sınamayı eklemelisin."], ["Konuyu farklı günlerde kısa sürelerle tekrar etmek", "Etkili", "Aralıklı tekrar unutmayı azaltır."]], mission: "Bir konuyu ertesi gün, üçüncü gün ve yedinci gün tekrar et." },
  4: { icon: "✍️", title: "Not Kalitesi Kontrolü", instruction: "Not parçalarını değerlendir.", categories: ["İyi not", "Gereksiz", "Eksik"], items: [["Fiil: İş, oluş veya hareket bildiren sözcük", "İyi not", "Kısa tanım ve anahtar kavram içeriyor."], ["Kitaptaki paragrafın tamamını aynen yazmak", "Gereksiz", "Seçmeden kopyalamak anlamayı zorlaştırır."], ["Yalnızca konu başlığını yazmak", "Eksik", "Başlık tek başına tekrar için yeterli değildir."]], mission: "Bir ders notunu anahtar kelime, açıklama ve örnekle yeniden düzenle." },
  5: { icon: "🔎", title: "Metin Haritası", instruction: "“Düzenli uyku öğrenmeyi destekler. Öğrenciler uyku saatlerine dikkat etmelidir.” metnindeki parçaları sınıflandır.", categories: ["Konu", "Ana fikir", "Ayrıntı"], items: [["Uyku ve öğrenme", "Konu", "Metnin genel olarak neden söz ettiğini gösterir."], ["Düzenli uyku öğrenmeyi desteklediği için uyku düzenine dikkat edilmelidir.", "Ana fikir", "Metnin temel mesajıdır."], ["Öğrencilerin uyku saatleri", "Ayrıntı", "Metinde geçen özel bir noktadır."]], mission: "Üç kısa metinde konu, ana fikir ve önemli ayrıntıyı belirle." },
  6: { icon: "🧭", title: "Hata Türü Avı", instruction: "Her yanlışın olası nedenini bul.", categories: ["Konu", "Dikkat", "İşlem", "Zaman"], items: [["Formülü hiç hatırlamadım.", "Konu", "Bilgi veya kavram eksikliği bulunuyor."], ["Soru “değildir” diyordu, fark etmedim.", "Dikkat", "Soru kökü yeterince dikkatli okunmamış."], ["7 × 8 işlemini 54 buldum.", "İşlem", "Çözüm bilinse de hesaplama hatası yapılmış."]], mission: "Beş yanlışını nedenlerine göre işaretle ve çözüm yaz." },
  7: { icon: "📊", title: "Deneme Karar Merkezi", instruction: "Sonuçlardan çıkarılabilecek en doğru kararı seç.", categories: ["Güçlü yön", "Öncelik", "İzle"], items: [["Türkçe 18 doğru, 2 yanlış", "Güçlü yön", "Yüksek doğruluk sürdürülebilecek bir güçlü yöndür."], ["Matematikte aynı konudan 5 yanlış", "Öncelik", "Tekrarlanan konu eksiği öncelik olmalıdır."], ["Bir soruda işlem hatası", "İzle", "Tek hata hemen büyük bir konu eksiği anlamına gelmez."]], mission: "Son denemendeki yanlışları konu, dikkat ve zaman başlıklarıyla incele." },
  8: { icon: "🌤️", title: "Düşünce Dönüştürücü", instruction: "Sınav anındaki düşünceleri etkilerine göre ayır.", categories: ["Destekler", "Kaygıyı artırır"], items: [["Heyecanlı olsam da bildiğim sorulardan başlayabilirim.", "Destekler", "Kontrol edebileceğin bir adıma odaklanır."], ["Bir soruyu yapamazsam sınav tamamen kötü geçer.", "Kaygıyı artırır", "Tek bir durumu bütün sınava geneller."], ["Nefesimi yavaşlatıp soruyu yeniden okuyabilirim.", "Destekler", "Uygulanabilir bir sakinleşme adımı içerir."]], mission: "Deneme öncesinde yavaş nefes al ve destekleyici cümleni kullan." },
  9: { icon: "⏳", title: "Zaman Bütçesi", instruction: "Günlük etkinlikleri doğru zaman grubuna yerleştir.", categories: ["Zorunlu", "Ders", "Dinlenme", "Eğlence"], items: [["Okul ve yemek saatleri", "Zorunlu", "Önceden belli olan temel zamanlardır."], ["25 dakika problem çözme", "Ders", "Açık görev ve süre içeren çalışma zamanıdır."], ["10 dakika yürüyüş", "Dinlenme", "Zihnin ve bedenin toparlanmasına yardım eder."]], mission: "Üç gün boyunca ders, dinlenme ve eğlence sürelerini not et." },
  10: { icon: "🏆", title: "Hedef Netleştirici", instruction: "Hedeflerin ölçülebilir olup olmadığına karar ver.", categories: ["Net hedef", "Belirsiz", "Küçült"], items: [["Bu hafta dört gün 15 paragraf sorusu çözeceğim.", "Net hedef", "Sayı ve zaman açıkça belirtilmiş."], ["Derslerimde daha iyi olacağım.", "Belirsiz", "Neyin ve nasıl ölçüleceği belli değil."], ["Bu ay bütün eksiklerimi tamamen bitireceğim.", "Küçült", "Hedef çok geniş; konu ve günlük adım seçilmelidir."]], mission: "Bir haftalık hedef belirle ve hafta sonunda sonucunu değerlendir." }
};

const BADGES = [
  ["İlk Adım", "İlk modülünü tamamladığında açılır.", "🌱", completed => completed.length >= 1],
  ["Plan Ustası", "Plan yapma modülünü tamamladığında açılır.", "🗓️", completed => completed.includes(1)],
  ["Dikkat Koruyucusu", "Dikkat modülünü tamamladığında açılır.", "🛡️", completed => completed.includes(2)],
  ["Tekrar Kahramanı", "Etkili tekrar modülünü tamamladığında açılır.", "🔁", completed => completed.includes(3)],
  ["Not Uzmanı", "Not tutma modülünü tamamladığında açılır.", "✍️", completed => completed.includes(4)],
  ["Anlama Dedektifi", "Okuduğunu anlama modülünü tamamladığında açılır.", "🔎", completed => completed.includes(5)],
  ["Hata Avcısı", "Hata analizi modülünü tamamladığında açılır.", "🧭", completed => completed.includes(6)],
  ["Deneme Analisti", "Deneme analizi modülünü tamamladığında açılır.", "📊", completed => completed.includes(7)],
  ["Kaygı Savaşçısı", "Sınav kaygısı modülünü tamamladığında açılır.", "🌤️", completed => completed.includes(8)],
  ["Zaman Yöneticisi", "Zaman yönetimi modülünü tamamladığında açılır.", "⏳", completed => completed.includes(9)],
  ["Hedef Şampiyonu", "Hedef modülünü tamamladığında açılır.", "🏆", completed => completed.includes(10)],
  ["10'da 10", "Tüm modülleri tamamladığında açılır.", "⭐", completed => completed.length === 10]
];

function moduleFieldKey(label, index) {
  const key = String(label || `alan-${index + 1}`)
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 36);
  return key || `alan-${index + 1}`;
}

function normalizeManagedModule(raw, index = 0, fallback = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const fallbackFields = Array.isArray(fallback.fields) ? fallback.fields : [];
  const fields = Array.isArray(source.fields) && source.fields.length
    ? source.fields
    : fallbackFields;
  return {
    ...fallback,
    ...source,
    id: Number(source.id || fallback.id || index + 1),
    icon: String(source.icon || fallback.icon || "📘").slice(0, 4),
    title: String(source.title || fallback.title || `Yeni Modül ${index + 1}`).trim(),
    short: String(source.short || fallback.short || "Bu hafta yeni bir çalışma becerisi keşfet.").trim(),
    description: String(source.description || fallback.description || "Bu becerinin neden önemli olduğunu keşfet.").trim(),
    goal: String(source.goal || fallback.goal || "Bu modülün sonunda yeni bir çalışma adımı kazanacaksın.").trim(),
    story: String(source.story || fallback.story || source.description || fallback.description || "").trim(),
    task: String(source.task || fallback.task || "Bu beceriyi bugün küçük bir adımla uygula.").trim(),
    lesson: Array.isArray(source.lesson) && source.lesson.length ? source.lesson : (Array.isArray(fallback.lesson) && fallback.lesson.length ? fallback.lesson : [["💡", "Bir adım seç", "Bu beceriyi küçük bir denemeyle uygulamayı dene."], ["📝", "Kendi cümlenle yaz", "Ne fark ettiğini kısa bir notla kaydet."], ["🌱", "Tekrar et", "İşe yarayan adımı başka bir gün yeniden kullan."]]),
    fields: fields.map((field, fieldIndex) => {
      const item = Array.isArray(field) ? field : [];
      const label = String(item[1] || item[0] || `Kendi cevabım ${fieldIndex + 1}`).trim();
      return [
        String(item[0] || moduleFieldKey(label, fieldIndex)),
        label,
        item[2] === "textarea" || item[2] === "select" ? item[2] : "text",
        String(item[3] || "Kısa bir cevap yaz."),
        Array.isArray(item[4]) ? item[4].map(String) : undefined
      ].filter((value, valueIndex) => valueIndex < 4 || value !== undefined);
    }),
    checks: (Array.isArray(source.checks) && source.checks.length ? source.checks : (fallback.checks || ["Görevi tamamladım."])).map(item => String(item).trim()).filter(Boolean),
    active: source.active !== false,
    updatedAt: source.updatedAt || fallback.updatedAt || null
  };
}

function ensureModuleRuntimeData(module) {
  if (!module || !module.id) return;
  if (!MODULE_ANECDOTES[module.id]) {
    MODULE_ANECDOTES[module.id] = {
      title: "Bu becerinin günlük hayattaki karşılığı",
      paragraphs: [module.story || module.description, "Bu modülü kendi deneyimlerinle ilişkilendirdiğinde öğrendiklerin daha anlamlı olur.", "Küçük bir deneme yapıp sonucunu gözlemle; gelişim tek seferlik değil, tekrar eden adımlarla oluşur."],
      takeaway: module.goal || "Küçük ve uygulanabilir bir adım seçerek başlayabilirsin."
    };
  }
  if (!MODULE_EXTRAS[module.id]) {
    MODULE_EXTRAS[module.id] = {
      duration: "10–15 dk.",
      warmup: "Bu beceriyi kullanırken seni en çok zorlayan şey ne olabilir?",
      steps: ["Kısa bir örnek düşün.", "Kendi yöntemini seç.", "Bugün küçük bir deneme yap.", "Sonucunu bir cümleyle değerlendir."],
      powerTip: "Küçük bir adımı seçip bugün denemek, uzun bir plan yapıp başlamamaktan daha etkilidir.",
      commonMistake: "Her şeyi aynı anda değiştirmeye çalışmak. Önce tek bir davranış seçip onu gözlemle.",
      quiz: { question: "Bu beceriyi geliştirmenin iyi bir başlangıcı hangisidir?", options: ["Hiç denemeden beklemek", "Küçük bir adım seçip uygulamak", "Bütün haftayı tek günde tamamlamak"], answer: 1, explanation: "Küçük ve uygulanabilir bir adım, yeni bir alışkanlığın başlamasını kolaylaştırır." }
    };
  }
  if (!ACTIVITY_LABS[module.id]) {
    ACTIVITY_LABS[module.id] = {
      icon: module.icon || "🧠",
      title: `${module.title} karar atölyesi`,
      instruction: "Her durumda sana en uygun seçeneği düşün.",
      categories: ["Uygun", "Geliştir"],
      items: [["Bu beceriyi küçük bir adımla denemek", "Uygun", "Küçük bir deneme başlamak için iyi bir yoldur."], ["Her şeyi bir anda değiştirmek", "Geliştir", "Bir davranışı seçip adım adım ilerlemek daha sürdürülebilirdir."], ["Sonucu kısa bir notla değerlendirmek", "Uygun", "Ne öğrendiğini fark etmek sonraki adımı güçlendirir."]],
      mission: "Bu hafta bu beceriyi en az bir gün gerçek hayatında dene."
    };
  }
}

function hydrateManagedModuleCatalog() {
  const stored = loadData(STORAGE_KEYS.modules, null);
  if (Array.isArray(stored) && stored.length) {
    const defaults = new Map(MODULES.map(module => [module.id, module]));
    const restored = stored.map((item, index) => normalizeManagedModule(item, index, defaults.get(Number(item?.id)) || {}));
    MODULES.splice(0, MODULES.length, ...restored);
  }
  MODULES.forEach(ensureModuleRuntimeData);
}

function saveManagedModuleCatalog() {
  const clean = MODULES.map(module => normalizeManagedModule(module, module.id - 1));
  localStorage.setItem(STORAGE_KEYS.modules, JSON.stringify(clean));
}

function getActiveModules() {
  return MODULES.filter(module => module.active !== false);
}

function getModuleById(moduleId) {
  return MODULES.find(module => module.id === Number(moduleId)) || null;
}

hydrateManagedModuleCatalog();

const state = {
  page: "home",
  activeModule: null,
  activeWorkshopModule: null,
  settings: loadData(STORAGE_KEYS.settings, { studentName: "", dailyGoal: 30, theme: "blue" }),
  answers: loadData(STORAGE_KEYS.answers, {}),
  checks: loadData(STORAGE_KEYS.checks, {}),
  completed: loadData(STORAGE_KEYS.completed, {}),
  plan: normalizePlan(loadData(STORAGE_KEYS.plan, createEmptyPlan())),
  planHistory: loadData(STORAGE_KEYS.planHistory, {}),
  planWeekKey: loadData(STORAGE_KEYS.planWeekKey, null),
  quizzes: loadData(STORAGE_KEYS.quizzes, {}),
  activities: loadData(STORAGE_KEYS.activities, {}),
  attendance: loadData(STORAGE_KEYS.attendance, {}),
  readingLog: loadData(STORAGE_KEYS.readingLog, {}),
  workshop: loadData(STORAGE_KEYS.workshop, createEmptyWorkshopState()),
  onboardingDone: loadData(STORAGE_KEYS.onboarding, false)
};

cloudSession = loadData(STORAGE_KEYS.cloudSession, null);

const main = document.querySelector("#main-content");
const pageTitle = document.querySelector("#page-title");
const studentChipName = document.querySelector("#student-chip-name");
const gateway = document.querySelector("#access-gateway");
const studentApp = document.querySelector("#student-app");
const studentMobileNav = document.querySelector("#student-mobile-nav");
const teacherApp = document.querySelector("#teacher-app");
const teacherContent = document.querySelector("#teacher-content");
let toastTimer;

function loadData(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch (error) {
    console.warn("Kayıtlı veri okunamadı:", key, error);
    return fallback;
  }
}

function saveData(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    if (key !== STORAGE_KEYS.cloudSession && cloudSession?.role === "student") scheduleStudentSync();
    return true;
  } catch (error) {
    showToast("Bilgiler bu tarayıcıya kaydedilemedi. Depolama iznini kontrol edebilirsin.", "error");
    return false;
  }
}

function createEmptyWorkshopState() {
  return { startedAt: null, answers: {}, checks: {}, quizzes: {}, completed: {}, lastActivity: null };
}

function normalizeWorkshopState(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    startedAt: source.startedAt || null,
    answers: source.answers && typeof source.answers === "object" ? source.answers : {},
    checks: source.checks && typeof source.checks === "object" ? source.checks : {},
    quizzes: source.quizzes && typeof source.quizzes === "object" ? source.quizzes : {},
    completed: source.completed && typeof source.completed === "object" ? source.completed : {},
    lastActivity: source.lastActivity || null
  };
}

function saveWorkshopState() {
  state.workshop = normalizeWorkshopState(state.workshop);
  saveData(STORAGE_KEYS.workshop, state.workshop);
}

function createPlanItem(day) {
  const id = globalThis.crypto?.randomUUID?.() || `plan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return { id, day, subject: "", topic: "", duration: "", breakDuration: "5", done: false, note: "" };
}

function createEmptyPlan() {
  return DAYS.map(day => createPlanItem(day));
}

function normalizePlan(plan) {
  const source = Array.isArray(plan) ? plan : [];
  const normalized = source
    .filter(item => item && DAYS.includes(item.day))
    .map(item => ({
      id: item.id || (globalThis.crypto?.randomUUID?.() || `plan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
      day: item.day,
      subject: String(item.subject || ""),
      topic: String(item.topic || ""),
      duration: String(item.duration || ""),
      breakDuration: String(item.breakDuration ?? "5"),
      done: Boolean(item.done),
      note: String(item.note || "")
    }));
  DAYS.forEach(day => {
    if (!normalized.some(item => item.day === day)) normalized.push(createPlanItem(day));
  });
  return normalized.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day));
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message, type = "success") {
  const toast = document.querySelector("#toast");
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  toastTimer = setTimeout(() => { toast.className = "toast"; }, 3600);
}

function getCompletedIds() {
  const activeIds = new Set(getActiveModules().map(module => module.id));
  return Object.keys(state.completed).map(Number).filter(id => state.completed[id] && activeIds.has(id));
}

function getNextModule() {
  const modules = getActiveModules();
  return modules.find(module => !state.completed[module.id]) || modules[modules.length - 1] || null;
}

function getLastCompletedModule() {
  const records = Object.entries(state.completed).filter(([, value]) => value && value.completedAt);
  if (!records.length) return null;
  records.sort((a, b) => new Date(b[1].completedAt) - new Date(a[1].completedAt));
  return MODULES.find(module => module.id === Number(records[0][0])) || null;
}

function getLastAnsweredModule() {
  const entries = Object.entries(state.answers).filter(([, value]) => value && value.savedAt);
  if (!entries.length) return null;
  entries.sort((a, b) => new Date(b[1].savedAt) - new Date(a[1].savedAt));
  return { module: MODULES.find(item => item.id === Number(entries[0][0])), record: entries[0][1] };
}

function getPlanStats() {
  const planned = state.plan.filter(item => item.subject.trim() || item.topic.trim() || String(item.duration).trim());
  const completed = planned.filter(item => item.done);
  const minutes = planned.reduce((sum, item) => sum + (Number(item.duration) || 0), 0);
  const breakMinutes = planned.reduce((sum, item) => sum + (Number(item.breakDuration) || 0), 0);
  const plannedDays = new Set(planned.map(item => item.day)).size;
  return { planned: planned.length, plannedDays, completed: completed.length, minutes, breakMinutes, percent: planned.length ? Math.round((completed.length / planned.length) * 100) : 0 };
}

function getModuleStatus(moduleId) {
  if (state.completed[moduleId]) return { label: "✓ Tamamlandı", className: "completed" };
  const hasAnswer = state.answers[moduleId]?.values && Object.values(state.answers[moduleId].values).some(value => String(value).trim());
  const hasCheck = state.checks[moduleId]?.some(Boolean);
  const hasQuiz = Number.isInteger(state.quizzes[moduleId]?.selected);
  const hasActivity = state.activities[moduleId] && Object.keys(state.activities[moduleId]).length > 0;
  if (hasAnswer || hasCheck || hasQuiz || hasActivity) return { label: "Devam Ediyor", className: "progress" };
  return { label: "Başlanmadı", className: "" };
}

function formatDate(iso) {
  if (!iso) return "Henüz yok";
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getReadingWeek(referenceDate = new Date()) {
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const daysSinceThursday = (today.getDay() - 4 + 7) % 7;
  const start = new Date(today);
  start.setDate(today.getDate() - daysSinceThursday);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date, key: localDateKey(date) };
  });
  return { start, end: days[6].date, days, today, todayKey: localDateKey(today), weekKey: localDateKey(start) };
}

function formatReadingDay(date) {
  return {
    weekday: new Intl.DateTimeFormat("tr-TR", { weekday: "short" }).format(date).replace(".", ""),
    date: new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(date).replace(".", "")
  };
}

function isReadingEntryCompleted(entry) {
  return Boolean(entry === true || entry?.completedAt);
}

function isLateReadingEntry(entry, readingDateKey) {
  if (!isReadingEntryCompleted(entry)) return false;
  if (entry?.late === true) return true;
  if (!entry?.completedAt || !readingDateKey) return false;
  return localDateKey(new Date(entry.completedAt)) > readingDateKey;
}

function getReadingEntryForDate(payload = state, dayKey) {
  const readingLog = payload?.readingLog || {};
  const direct = readingLog[dayKey];
  if (direct) return direct;
  const keyedEntry = Object.entries(readingLog).find(([key, entry]) => entry?.readingDate === dayKey || key === dayKey);
  if (keyedEntry) return keyedEntry[1];
  const legacyEntry = Object.entries(payload?.activities || {}).find(([, record]) => record?.readingCompletedAt && localDateKey(new Date(record.readingCompletedAt)) === dayKey);
  if (legacyEntry) {
    return {
      moduleId: Number(legacyEntry[0]),
      readingDate: dayKey,
      paragraphs: 5,
      completedAt: legacyEntry[1].readingCompletedAt,
      legacy: true
    };
  }
  return null;
}

function hasReadingForModule(moduleId, payload = state) {
  if (payload.activities?.[moduleId]?.readingCompleted) return true;
  return Object.values(payload.readingLog || {}).some(entry => isReadingEntryCompleted(entry) && Number(entry.moduleId) === Number(moduleId));
}

function getWeeklyTracking(payload = state, referenceDate = new Date()) {
  const week = getReadingWeek(referenceDate);
  const attendance = payload.attendance || {};
  const days = week.days.map(day => ({
    ...day,
    login: Boolean(attendance[day.key]),
    reading: isReadingEntryCompleted(getReadingEntryForDate(payload, day.key)),
    late: isLateReadingEntry(getReadingEntryForDate(payload, day.key), day.key),
    readingEntry: getReadingEntryForDate(payload, day.key)
  }));
  return {
    ...week,
    days,
    loginCount: days.filter(day => day.login).length,
    readingCount: days.filter(day => day.reading).length
  };
}

function getPreviousWeekKey(referenceDate = new Date()) {
  const previous = getReadingWeek(referenceDate).start;
  previous.setDate(previous.getDate() - 7);
  return localDateKey(previous);
}

function prepareCurrentPlanWeek() {
  const currentWeekKey = getReadingWeek().weekKey;
  if (state.planWeekKey === currentWeekKey) return false;
  const activePlan = normalizePlan(state.plan).filter(isPlanItemActive);
  if (state.planWeekKey && activePlan.length) {
    state.planHistory[state.planWeekKey] = activePlan;
  } else if (!state.planWeekKey && activePlan.length) {
    const legacyWeekKey = getPreviousWeekKey();
    if (!state.planHistory[legacyWeekKey]) state.planHistory[legacyWeekKey] = activePlan;
  }
  state.plan = state.planHistory[currentWeekKey]
    ? normalizePlan(state.planHistory[currentWeekKey])
    : createEmptyPlan();
  state.planWeekKey = currentWeekKey;
  return true;
}

function saveCurrentPlanSnapshot() {
  const currentWeekKey = getReadingWeek().weekKey;
  state.planWeekKey = currentWeekKey;
  const activePlan = normalizePlan(state.plan).filter(isPlanItemActive);
  if (activePlan.length) state.planHistory[currentWeekKey] = activePlan;
  else delete state.planHistory[currentWeekKey];
  persistStudentStateLocally();
  scheduleStudentSync();
}

function getStudentCourseWeekStatus(student, referenceDate = new Date()) {
  const progress = getStudentProgress(student);
  const payload = progress.payload || {};
  const createdAt = new Date(student.created_at);
  const joinedAt = Number.isNaN(createdAt.getTime()) ? referenceDate : createdAt;
  const joinedWeekStart = getReadingWeek(joinedAt).start;
  const currentWeekStart = getReadingWeek(referenceDate).start;
  const elapsedWeeks = Math.max(0, Math.floor((currentWeekStart.getTime() - joinedWeekStart.getTime()) / (7 * 86400000)));
  const activeModules = getActiveModules();
  const expectedModuleCount = Math.min(activeModules.length, elapsedWeeks);
  const completedIds = new Set(Object.keys(payload.completed || {}).map(Number));
  const overdueModules = activeModules.slice(0, expectedModuleCount).filter(module => !completedIds.has(module.id));
  return { elapsedWeeks, expectedModuleCount, overdueModules };
}

function getTeacherStudentAlerts(student, referenceDate = new Date()) {
  const progress = getStudentProgress(student);
  const tracking = getWeeklyTracking(progress.payload || {});
  const courseWeek = getStudentCourseWeekStatus(student, referenceDate);
  const today = tracking.days.find(day => day.key === tracking.todayKey);
  const missedReadingDays = tracking.days.filter(day => day.key < tracking.todayKey && !day.reading);
  return {
    overdueModules: courseWeek.overdueModules,
    missedReadingDays,
    readingPendingToday: Boolean(today && !today.reading),
    hasAlert: courseWeek.overdueModules.length > 0 || missedReadingDays.length > 0 || Boolean(today && !today.reading)
  };
}

function recordDailyAttendance() {
  if (studentPreviewMode || cloudSession?.role !== "student") return false;
  const todayKey = localDateKey();
  if (state.attendance[todayKey]) return false;
  state.attendance[todayKey] = new Date().toISOString();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 120);
  Object.keys(state.attendance).forEach(key => { if (key < localDateKey(cutoff)) delete state.attendance[key]; });
  persistStudentStateLocally();
  return true;
}

function getHomeWarningWeeks() {
  const currentWeek = getReadingWeek();
  const weekKeys = new Set([currentWeek.weekKey]);
  const parseDateKey = key => {
    const parts = String(key || "").split("-").map(Number);
    return parts.length === 3 && parts.every(Number.isFinite) ? new Date(parts[0], parts[1] - 1, parts[2]) : null;
  };
  Object.keys(state.planHistory || {}).forEach(key => { if (parseDateKey(key)) weekKeys.add(key); });
  Object.entries(state.readingLog || {}).forEach(([key, entry]) => {
    const date = parseDateKey(entry?.readingDate || key);
    if (date) weekKeys.add(getReadingWeek(date).weekKey);
  });
  Object.values(state.completed || {}).forEach(record => {
    const date = record?.completedAt ? new Date(record.completedAt) : null;
    if (date && !Number.isNaN(date.getTime())) weekKeys.add(getReadingWeek(date).weekKey);
  });
  return [...weekKeys].map(key => ({ key, week: getReadingWeek(parseDateKey(key) || new Date()) })).filter(item => item.week.start <= currentWeek.start).sort((a, b) => b.week.start - a.week.start);
}

function getHomeWarningModule(week, currentWeek) {
  const entries = Object.entries(state.readingLog || {}).filter(([key, entry]) => {
    const date = entry?.readingDate || key;
    return date && getReadingWeek(new Date(`${date}T12:00:00`)).weekKey === week.weekKey;
  });
  const explicitId = entries.map(([, entry]) => Number(entry?.moduleId)).find(id => getModuleById(id));
  if (explicitId) return getModuleById(explicitId);
  const completedInWeek = Object.entries(state.completed || {}).find(([, record]) => record?.completedAt && getReadingWeek(new Date(record.completedAt)).weekKey === week.weekKey);
  if (completedInWeek) return getModuleById(Number(completedInWeek[0]));
  if (week.weekKey === currentWeek.weekKey) return getNextModule();
  return null;
}

function getStudentHomeWarnings() {
  const currentWeek = getReadingWeek();
  const warnings = [];
  getHomeWarningWeeks().forEach(({ week }) => {
    const isCurrent = week.weekKey === currentWeek.weekKey;
    const daysToCheck = isCurrent ? week.days.filter(day => day.key <= currentWeek.todayKey) : week.days;
    const module = getHomeWarningModule(week, currentWeek);
    daysToCheck.filter(day => !isReadingEntryCompleted(getReadingEntryForDate(state, day.key))).forEach(day => {
      const labels = formatReadingDay(day.date);
      warnings.push({
        kind: day.key === currentWeek.todayKey ? "today" : "reading",
        moduleId: module?.id || "",
        title: `${module ? `${module.id}. modül` : "Haftalık okuma"} • ${labels.weekday} ${labels.date}`,
        detail: day.key === currentWeek.todayKey ? "Bugünün 5 paragrafı henüz işaretlenmedi." : "Bu günün 5 paragrafı okunmamış. İstersen telafi edebilirsin.",
        actionLabel: day.key === currentWeek.todayKey ? "Okumaya geç" : "Telafi et",
        dateKey: day.key,
        weekLabel: `${formatReadingDay(week.start).date} – ${formatReadingDay(week.end).date}`
      });
    });
  });
  const nextModule = getNextModule();
  if (nextModule && !state.completed[nextModule.id]) {
    const hasStarted = Boolean(state.answers[nextModule.id]?.values && Object.values(state.answers[nextModule.id].values).some(value => String(value).trim())) || Boolean(state.activities[nextModule.id]) || Boolean(state.quizzes[nextModule.id]);
    warnings.push({
      kind: hasStarted ? "module" : "module-start",
      moduleId: nextModule.id,
      title: `${nextModule.id}. modül • Uygulama tamamlanmadı`,
      detail: hasStarted ? "Cevaplarını, kontrol listesini ve küçük uygulamayı tamamlayabilirsin." : "Bu haftanın çalışma becerisi seni bekliyor. Küçük bir adımla başlayabilirsin.",
      actionLabel: hasStarted ? "Devam et" : "Modülü aç",
      dateKey: "",
      weekLabel: "Bu haftanın görevi"
    });
  }
  return warnings;
}

function renderHomeWarnings() {
  const warnings = getStudentHomeWarnings();
  if (!warnings.length) return `<section class="home-followup-panel all-clear"><div class="home-followup-heading"><span>✓</span><div><span class="section-tag">ÇALIŞMA TAKİBİ</span><h3>Şimdilik bekleyen bir görevin yok</h3><p>Günlük okumanı ve modül adımlarını düzenli sürdürüyorsun. Harika gidiyorsun!</p></div></div></section>`;
  return `<section class="home-followup-panel"><div class="home-followup-heading"><span>!</span><div><span class="section-tag">ÇALIŞMA TAKİBİ</span><h3>Takip edilmesi gerekenler</h3><p>Hangi hafta hangi adımın eksik kaldığını buradan görebilirsin. Bir gün kaçtıysa telafi edebilirsin.</p></div><strong class="home-followup-count">${warnings.length}</strong></div><div class="home-warning-list">${warnings.slice(0, 8).map(item => `<article class="home-warning-item ${item.kind}"><div class="home-warning-icon">${item.kind === "module" || item.kind === "module-start" ? "🧩" : item.kind === "today" ? "📖" : "↺"}</div><div class="home-warning-copy"><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.weekLabel)}</small><p>${escapeHTML(item.detail)}</p></div><button class="button secondary small" type="button" data-action="open-home-warning" data-module-id="${item.moduleId}" data-warning-date="${item.dateKey}">${escapeHTML(item.actionLabel)} →</button></article>`).join("")}</div>${warnings.length > 8 ? `<p class="home-followup-more">${warnings.length - 8} küçük adım daha listeleniyor. Önce üstteki görevlerden birini seçebilirsin.</p>` : ""}</section>`;
}

function getNextStudentAction() {
  const tracking = getWeeklyTracking();
  const todayEntry = getReadingEntryForDate(state, tracking.todayKey) || {};
  const nextModule = getNextModule();
  if (!isReadingEntryCompleted(todayEntry)) return { type: "reading", icon: "📖", eyebrow: "BUGÜNÜN İLK ADIMI", title: "Bugün 5 paragraf oku", detail: `${tracking.readingCount}/7 günlük okuma tamamlandı. Okumayı bitirince buraya dönüp işaretleyebilirsin.`, actionLabel: "Okumaya geç", moduleId: nextModule?.id || "", dateKey: tracking.todayKey };
  if (nextModule && !state.completed[nextModule.id]) {
    const started = Boolean(state.answers[nextModule.id]?.values && Object.values(state.answers[nextModule.id].values).some(value => String(value).trim())) || Boolean(state.activities[nextModule.id]);
    return { type: "module", icon: "🧩", eyebrow: "SIRADAKİ GELİŞİM ADIMI", title: `${nextModule.id}. modüle ${started ? "devam et" : "başla"}`, detail: started ? "Cevaplarını, kontrol listesini ve uygulama adımlarını tamamlayabilirsin." : "Bu haftanın becerisini kısa bölümler hâlinde keşfet.", actionLabel: started ? "Devam et" : "Modülü aç", moduleId: nextModule.id, dateKey: "" };
  }
  const plan = getPlanStats();
  if (plan.planned && plan.completed < plan.planned) return { type: "plan", icon: "🗓️", eyebrow: "HAFTALIK PLAN", title: "Planındaki bir görevi tamamla", detail: `${plan.completed}/${plan.planned} görev tamamlandı. Küçük bir görev seçip başlayabilirsin.`, actionLabel: "Planı aç", moduleId: "", dateKey: "" };
  return { type: "success", icon: "🌟", eyebrow: "BUGÜNÜN MESAJI", title: "Düzenli ilerliyorsun", detail: "Bugün istersen tamamladığın bir modülü yeniden inceleyebilirsin.", actionLabel: "Modülleri gör", moduleId: nextModule?.id || getActiveModules()[0]?.id || "", dateKey: "" };
}

function renderNextStudentAction() {
  const item = getNextStudentAction();
  const action = item.type === "plan" ? `data-page="plan"` : item.type === "success" ? `data-page="modules"` : `data-action="open-home-warning" data-module-id="${item.moduleId}" data-warning-date="${item.dateKey}"`;
  return `<section class="next-action-card ${item.type}"><div class="next-action-icon">${item.icon}</div><div class="next-action-copy"><span class="section-tag">${item.eyebrow}</span><h3>${item.title}</h3><p>${item.detail}</p></div><button class="button ${item.type === "success" ? "secondary" : "primary"} small" type="button" ${action} title="${escapeHTML(item.detail)}">${item.actionLabel} →</button></section>`;
}

function renderStudentColorLegend() {
  return `<div class="student-color-legend" aria-label="Durum renkleri"><span><i class="done"></i> Tamamlandı</span><span><i class="today"></i> Bugün yapılacak</span><span><i class="missed"></i> Kaçırıldı / telafi</span><span><i class="locked"></i> Henüz zamanı gelmedi</span></div>`;
}

function renderStudentWeeklyTimeline() {
  const tracking = getWeeklyTracking();
  return `<section class="weekly-timeline-panel"><div class="weekly-timeline-heading"><div><span class="section-tag">HAFTALIK ZAMAN ÇİZELGESİ</span><h3>Perşembe – Çarşamba okuma akışın</h3><p>Bu hafta <strong>${tracking.loginCount}/7 gün</strong> giriş yaptın, <strong>${tracking.readingCount}/7 gün</strong> okuma tamamladın.</p></div><strong>${tracking.readingCount}/7 gün</strong></div><div class="weekly-timeline">${tracking.days.map(day => { const status = day.reading ? (day.late ? "late" : "done") : day.key === tracking.todayKey ? "today" : day.key < tracking.todayKey ? "missed" : "locked"; const labels = formatReadingDay(day.date); const text = day.reading ? (day.late ? "Telafi" : "Okundu") : day.key === tracking.todayKey ? "Bugün" : day.key < tracking.todayKey ? "Kaçırıldı" : "Bekliyor"; return `<div class="timeline-day ${status}"><span>${escapeHTML(labels.weekday)}</span><strong>${escapeHTML(labels.date)}</strong><small>${text}</small></div>`; }).join("")}</div>${renderStudentColorLegend()}</section>`;
}

function getModuleRouteStage(moduleId) {
  const module = getModuleById(moduleId);
  if (!module) return 1;
  if (state.completed[moduleId]) return 5;
  const filled = module.fields.filter(field => String(state.answers[moduleId]?.values?.[field[0]] || "").trim()).length;
  const checks = (state.checks[moduleId] || []).filter(Boolean).length;
  const lab = Object.keys(state.activities[moduleId]?.choices || {}).length;
  const quiz = Number.isInteger(state.quizzes[moduleId]?.selected);
  if (quiz) return 5;
  if (lab) return 4;
  if (filled || checks) return 3;
  return 1;
}

const STUDENT_ONBOARDING_STEPS = [
  ["👋", "Akademiye hoş geldin!", "Her hafta bir çalışma becerisi öğrenecek, kısa bir uygulama yapacak ve ilerlemeni burada göreceksin."],
  ["📚", "Modül nasıl tamamlanır?", "Önce anlatımı oku, sonra mini soruyu ve etkileşimli atölyeyi dene. Cevaplarını yazıp kontrol listesini işaretle."],
  ["📖", "Paragraf görevi nasıl yapılır?", "Her gün Okuma Atölyesi’ne gidip 5 paragraf oku. Sonra Akademi’ye dönerek o günün kaydını tamamla."]
];

function renderStudentOnboarding() {
  const step = STUDENT_ONBOARDING_STEPS[onboardingStep] || STUDENT_ONBOARDING_STEPS[0];
  const last = onboardingStep === STUDENT_ONBOARDING_STEPS.length - 1;
  return `<div class="student-onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-title"><div class="student-onboarding-backdrop" data-action="close-onboarding"></div><article class="student-onboarding-card"><button class="onboarding-skip" type="button" data-action="close-onboarding">Atla</button><div class="onboarding-progress">${STUDENT_ONBOARDING_STEPS.map((_, index) => `<i class="${index === onboardingStep ? "active" : index < onboardingStep ? "done" : ""}"></i>`).join("")}</div><div class="onboarding-icon">${step[0]}</div><span class="section-tag">${onboardingStep + 1}. ADIM</span><h2 id="onboarding-title">${step[1]}</h2><p>${step[2]}</p><button class="button primary" type="button" data-action="onboarding-next">${last ? "Akademiye başla" : "Devam et"} →</button></article></div>`;
}

function navigate(page, options = {}) {
  state.page = page;
  state.activeModule = options.moduleId || null;
  state.activeWorkshopModule = options.workshopModuleId || null;
  document.querySelectorAll("[data-page]").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });
  renderCurrentPage();
  window.scrollTo({ top: 0, behavior: "smooth" });
  setTimeout(() => main.focus({ preventScroll: true }), 50);
}

function showWorkspace(name) {
  gateway.classList.toggle("is-hidden", name !== "gateway");
  studentApp.classList.toggle("is-hidden", name !== "student");
  studentMobileNav.classList.toggle("is-hidden", name !== "student");
  teacherApp.classList.toggle("is-hidden", name !== "teacher");
}

function setLoginMessage(id, message, type = "error") {
  const element = document.querySelector(`#${id}`);
  if (!element) return;
  element.textContent = message;
  element.className = `login-message ${message ? `show ${type}` : ""}`;
}

function setFormBusy(form, busy, label) {
  const button = form.querySelector('button[type="submit"]');
  if (!button) return;
  if (!button.dataset.originalText) button.dataset.originalText = button.innerHTML;
  button.disabled = busy;
  button.innerHTML = busy ? `<span class="button-spinner"></span>${label}` : button.dataset.originalText;
}

function buildStudentPayload() {
  return {
    version: 4,
    settings: state.settings,
    answers: state.answers,
    checks: state.checks,
    completed: state.completed,
    plan: state.plan,
    planHistory: state.planHistory,
    planWeekKey: state.planWeekKey,
    quizzes: state.quizzes,
    activities: state.activities,
    attendance: state.attendance,
    readingLog: state.readingLog,
    workshop: state.workshop
  };
}

function safeBackupName(value = "yedek") {
  return String(value).toLocaleLowerCase("tr-TR").replace(/[^a-z0-9çğıöşü]+/gi, "-").replace(/^-|-$/g, "") || "yedek";
}

function createStudentBackup(studentName, payload, metadata = {}) {
  return {
    app: "Verimli Ders Çalışma Akademisi",
    backupType: "student",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    student: { name: studentName || "Öğrenci", ...metadata },
    payload
  };
}

function downloadJSONBackup(filename, content) {
  const blob = new Blob([JSON.stringify(content, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadCurrentStudentBackup() {
  const studentName = cloudSession?.studentName || state.settings.studentName || "Öğrenci";
  const backup = createStudentBackup(studentName, buildStudentPayload(), {
    studentId: cloudSession?.studentId || null,
    className: cloudSession?.className || null
  });
  const date = new Date().toISOString().slice(0, 10);
  downloadJSONBackup(`vdca-${safeBackupName(studentName)}-${date}.json`, backup);
  showToast("Çalışmalarının yedeği indirildi. Dosyayı güvenli bir yerde saklayabilirsin. 💾");
}

async function restoreCurrentStudentBackup(file) {
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    if (backup?.app !== "Verimli Ders Çalışma Akademisi" || backup?.backupType !== "student" || !backup.payload || typeof backup.payload !== "object") {
      throw new Error("invalid-backup");
    }
    if (!window.confirm(`${backup.student?.name || "Öğrenci"} adına ait yedek, mevcut çalışmalarının üzerine yüklenecek. Devam etmek istiyor musun?`)) return;
    applyRemotePayload(backup.payload, cloudSession?.studentName || state.settings.studentName || backup.student?.name, false);
    state.plan = normalizePlan(state.plan);
    persistStudentStateLocally();
    scheduleStudentSync();
    renderSettings();
    showToast("Yedek başarıyla geri yüklendi ve çevrim içi hesaba kaydediliyor. ♻️");
  } catch (error) {
    showToast("Bu dosya geçerli bir Akademi öğrenci yedeği değil.", "error");
  }
}

function downloadRemoteStudentBackup(studentId) {
  const student = teacherStore.students.find(item => item.id === studentId);
  if (!student) return;
  const activeClass = teacherStore.classes.find(item => item.id === student.class_id);
  const progress = getStudentProgress(student);
  const backup = createStudentBackup(student.name, progress.payload || {}, {
    studentId: student.id,
    classId: student.class_id,
    className: activeClass?.name || null,
    completedCount: Number(progress.completed_count || 0),
    planPercent: Number(progress.plan_percent || 0),
    lastActivity: progress.last_activity || null
  });
  const date = new Date().toISOString().slice(0, 10);
  downloadJSONBackup(`vdca-${safeBackupName(student.name)}-${date}.json`, backup);
  showToast(`${student.name} için yedek dosyası indirildi. 💾`);
}

function downloadClassBackup(classId) {
  const classRecord = teacherStore.classes.find(item => item.id === classId);
  if (!classRecord) return;
  const students = teacherStore.students.filter(item => item.class_id === classId).map(student => {
    const progress = getStudentProgress(student);
    return {
      studentId: student.id,
      name: student.name,
      codeHint: student.code_hint,
      completedCount: Number(progress.completed_count || 0),
      planPercent: Number(progress.plan_percent || 0),
      lastActivity: progress.last_activity || null,
      payload: progress.payload || {}
    };
  });
  const backup = {
    app: "Verimli Ders Çalışma Akademisi",
    backupType: "class",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    class: { id: classRecord.id, name: classRecord.name, codeHint: classRecord.code_hint },
    students
  };
  const date = new Date().toISOString().slice(0, 10);
  downloadJSONBackup(`vdca-sinif-${safeBackupName(classRecord.name)}-${date}.json`, backup);
  showToast(`${classRecord.name} sınıfındaki ${students.length} öğrencinin yedeği indirildi. 🗂️`);
}

function persistStudentStateLocally() {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
  localStorage.setItem(STORAGE_KEYS.answers, JSON.stringify(state.answers));
  localStorage.setItem(STORAGE_KEYS.checks, JSON.stringify(state.checks));
  localStorage.setItem(STORAGE_KEYS.completed, JSON.stringify(state.completed));
  localStorage.setItem(STORAGE_KEYS.plan, JSON.stringify(state.plan));
  localStorage.setItem(STORAGE_KEYS.planHistory, JSON.stringify(state.planHistory));
  localStorage.setItem(STORAGE_KEYS.planWeekKey, JSON.stringify(state.planWeekKey));
  localStorage.setItem(STORAGE_KEYS.quizzes, JSON.stringify(state.quizzes));
  localStorage.setItem(STORAGE_KEYS.activities, JSON.stringify(state.activities));
  localStorage.setItem(STORAGE_KEYS.attendance, JSON.stringify(state.attendance));
  localStorage.setItem(STORAGE_KEYS.readingLog, JSON.stringify(state.readingLog));
  localStorage.setItem(STORAGE_KEYS.workshop, JSON.stringify(state.workshop));
}

function applyRemotePayload(payload, studentName, keepLocalWhenRemoteEmpty = false) {
  const hasRemoteWork = payload && typeof payload === "object" && Object.keys(payload).some(key => key !== "version");
  if (hasRemoteWork) {
    state.settings = { studentName: "", dailyGoal: 30, theme: "blue", ...(payload.settings || {}) };
    state.answers = payload.answers || {};
    state.checks = payload.checks || {};
    state.completed = payload.completed || {};
    state.plan = normalizePlan(payload.plan);
    state.planHistory = payload.planHistory || {};
    state.planWeekKey = payload.planWeekKey || null;
    state.quizzes = payload.quizzes || {};
    state.activities = payload.activities || {};
    state.attendance = payload.attendance || {};
    state.readingLog = payload.readingLog || {};
    state.workshop = normalizeWorkshopState(payload.workshop);
  } else if (!keepLocalWhenRemoteEmpty) {
    state.settings = { studentName: "", dailyGoal: 30, theme: "blue" };
    state.answers = {};
    state.checks = {};
    state.completed = {};
    state.plan = createEmptyPlan();
    state.planHistory = {};
    state.planWeekKey = null;
    state.quizzes = {};
    state.activities = {};
    state.attendance = {};
    state.readingLog = {};
    state.workshop = createEmptyWorkshopState();
  }
  state.settings.studentName = studentName || state.settings.studentName;
  prepareCurrentPlanWeek();
  persistStudentStateLocally();
  return hasRemoteWork;
}

function applyPreviewPayload(payload, studentName) {
  const previewPayload = payload && typeof payload === "object" ? payload : {};
  state.settings = { studentName: "", dailyGoal: 30, theme: "blue", ...(previewPayload.settings || {}) };
  state.answers = previewPayload.answers || {};
  state.checks = previewPayload.checks || {};
  state.completed = previewPayload.completed || {};
  state.plan = normalizePlan(previewPayload.plan);
  state.planHistory = previewPayload.planHistory || {};
  state.planWeekKey = previewPayload.planWeekKey || null;
  state.quizzes = previewPayload.quizzes || {};
  state.activities = previewPayload.activities || {};
  state.attendance = previewPayload.attendance || {};
  state.readingLog = previewPayload.readingLog || {};
  state.workshop = normalizeWorkshopState(previewPayload.workshop);
  state.settings.studentName = studentName || state.settings.studentName;
}

function enforceStudentPreviewReadOnly() {
  if (!studentPreviewMode) return;
  main.querySelectorAll("input, textarea, select").forEach(control => { control.disabled = true; });
  main.querySelectorAll([
    'button[type="submit"]',
    '[data-action="quiz-option"]',
    '[data-action="activity-choice"]',
    '[data-action="activity-confidence"]',
    '[data-action="activity-day"]',
    '[data-action="save-activity-reflection"]',
    '[data-action="complete-daily-reading"]',
    '[data-action="save-draft"]',
    '[data-action="add-plan-task"]',
    '[data-action="remove-plan-task"]',
    '[data-action="clear-plan"]',
    '[data-action="select-theme"]',
    '[data-action="download-student-backup"]',
    '[data-action="reset-data"]'
    ,'[data-action="start-workshop"]'
    ,'[data-action="workshop-quiz-option"]'
    ,'[data-action="save-workshop-draft"]'
    ,'[data-action="complete-workshop-module"]'
  ].join(",")).forEach(button => { button.disabled = true; });
  const logoutButton = document.querySelector('[data-action="student-logout"]');
  if (logoutButton) logoutButton.hidden = true;
  updateCloudStatus("preview", "Salt okunur öğrenci görünümü");
}

async function loadTeacherStudentPreview(studentId) {
  showWorkspace("student");
  main.innerHTML = `<div class="teacher-loading preview-loading"><span class="button-spinner dark"></span><strong>Öğrenci görünümü hazırlanıyor…</strong></div>`;
  const { data, error } = await cloudClient
    .from("students")
    .select("id,class_id,name,code_hint,active,student_progress(payload,completed_count,plan_percent,last_activity,updated_at)")
    .eq("id", studentId)
    .eq("active", true)
    .single();

  if (error || !data) {
    main.innerHTML = `<div class="teacher-error preview-error"><span>⚠️</span><h2>Öğrenci görünümü açılamadı</h2><p>Öğrencinin hâlâ sınıfta olduğunu kontrol edip yeniden deneyin.</p><button class="button primary" type="button" data-action="close-student-preview">← Öğretmen Paneline Dön</button></div>`;
    return;
  }

  studentPreviewMode = true;
  previewStudentRecord = data;
  const progress = getStudentProgress(data);
  applyPreviewPayload(progress.payload, data.name);
  state.page = "home";
  state.activeModule = null;
  state.activeWorkshopModule = null;
  document.body.classList.add("student-preview-mode");
  document.title = `${data.name} • Öğrenci Önizlemesi`;
  document.querySelector("#student-app .app-main")?.insertAdjacentHTML("afterbegin", `<aside class="student-preview-banner" id="student-preview-banner"><div><span>👁️</span><p><strong>${escapeHTML(data.name)} olarak görüntülüyorsunuz</strong><small>Öğretmen hesabınız açık kalır. Bu ekranda değişiklik yapılamaz.</small></p></div><div><button class="button preview-refresh small" type="button" data-action="refresh-student-preview">↻ Verileri Yenile</button><button class="button preview-close small" type="button" data-action="close-student-preview" title="Bu sekmeyi kapatıp öğretmen paneline dön">← Öğretmen Paneline Dön</button></div></aside>`);
  renderCurrentPage();
}

function openTeacherStudentPreview(studentId) {
  const student = teacherStore.students.find(item => item.id === studentId);
  if (!student) return;
  const previewUrl = new URL(window.location.href);
  previewUrl.search = "";
  previewUrl.hash = "";
  previewUrl.searchParams.set("student-preview", student.id);
  const previewWindow = window.open(previewUrl.toString(), "_blank");
  if (previewWindow) previewWindow.opener = null;
  else showToast("Öğrenci görünümü açılamadı. Tarayıcınızda yeni sekme izni vermeyi deneyin.", "error");
}

async function returnToTeacherPanel() {
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete("student-preview");
  cleanUrl.hash = "";
  window.history.replaceState({}, "", cleanUrl.toString());
  studentPreviewMode = false;
  previewStudentRecord = null;
  document.body.classList.remove("student-preview-mode");
  document.querySelector("#student-preview-banner")?.remove();
  document.title = "Verimli Ders Çalışma Akademisi • Öğretmen Paneli";
  showWorkspace("teacher");
  await loadTeacherData();
}

function updateCloudStatus(status, label) {
  const element = document.querySelector("#cloud-sync-status");
  if (!element) return;
  element.className = `cloud-sync-status ${status}`;
  const text = element.querySelector("span");
  if (text) text.textContent = label;
}

function scheduleStudentSync() {
  if (!cloudClient || cloudSession?.role !== "student") return;
  clearTimeout(cloudSyncTimer);
  updateCloudStatus("syncing", "Kaydediliyor…");
  cloudSyncTimer = setTimeout(synchronizeStudent, 700);
}

async function synchronizeStudent() {
  if (!cloudClient || cloudSession?.role !== "student") return;
  if (!navigator.onLine) {
    updateCloudStatus("offline", "Çevrim dışı");
    return;
  }
  const { error } = await cloudClient.rpc("student_sync", {
    p_class_code: cloudSession.classCode,
    p_student_code: cloudSession.studentCode,
    p_payload: buildStudentPayload(),
    p_completed_count: getCompletedIds().length,
    p_plan_percent: getPlanStats().percent
  });
  if (error) {
    console.warn("Çevrim içi kayıt yapılamadı:", error.message);
    updateCloudStatus("offline", "Yerel kaydedildi");
    return;
  }
  updateCloudStatus("online", "Tüm değişiklikler kaydedildi");
}

async function handleStudentLogin(form) {
  const studentName = form.elements.studentName.value.trim();
  const classCode = form.elements.classCode.value.trim().toUpperCase();
  const studentCode = form.elements.studentCode.value.trim().toUpperCase();
  setLoginMessage("student-login-message", "");
  if (!studentName || classCode.length < 6 || studentCode.length < 6) {
    setLoginMessage("student-login-message", "Adını ve öğretmeninin verdiği iki kodu eksiksiz yazabilir misin?");
    return;
  }
  if (!cloudClient) {
    setLoginMessage("student-login-message", "Çevrim içi sistem henüz yapılandırılmadı. Öğretmeninden yardım isteyebilirsin.");
    return;
  }
  setFormBusy(form, true, "Giriş kontrol ediliyor…");
  const { data, error } = await cloudClient.rpc("student_login", {
    p_class_code: classCode,
    p_student_code: studentCode,
    p_name: studentName
  });
  setFormBusy(form, false);
  if (error || !data) {
    setLoginMessage("student-login-message", "Bilgiler eşleşmedi. Kodlarını öğretmeninle birlikte kontrol edebilirsin.");
    return;
  }
  const sameStudent = cloudSession?.role === "student" && cloudSession.studentId === data.studentId;
  cloudSession = { role: "student", classCode, studentCode, studentId: data.studentId, studentName: data.studentName, className: data.className };
  localStorage.setItem(STORAGE_KEYS.cloudSession, JSON.stringify(cloudSession));
  applyRemotePayload(data.payload, data.studentName, sameStudent);
  recordDailyAttendance();
  showWorkspace("student");
  state.page = "home";
  state.activeModule = null;
  state.activeWorkshopModule = null;
  renderCurrentPage();
  await synchronizeStudent();
  showToast(`Hoş geldin ${data.studentName}! Çalışmaların artık öğretmeninle eş zamanlanıyor. 🌟`);
}

async function handleTeacherLogin(form) {
  const email = form.elements.email.value.trim();
  const password = form.elements.password.value;
  setLoginMessage("teacher-login-message", "");
  if (!email || !password) {
    setLoginMessage("teacher-login-message", "E-posta adresinizi ve şifrenizi yazın.");
    return;
  }
  if (!cloudClient) {
    setLoginMessage("teacher-login-message", "Çevrim içi sistem henüz yapılandırılmadı.");
    return;
  }
  setFormBusy(form, true, "Panel hazırlanıyor…");
  const { data, error } = await cloudClient.auth.signInWithPassword({ email, password });
  setFormBusy(form, false);
  if (error || !data.session) {
    setLoginMessage("teacher-login-message", "Giriş yapılamadı. E-posta ve şifrenizi kontrol edin.");
    return;
  }
  cloudSession = { role: "teacher", email };
  localStorage.setItem(STORAGE_KEYS.cloudSession, JSON.stringify(cloudSession));
  showWorkspace("teacher");
  await loadTeacherData();
}

async function initializeApplication() {
  showWorkspace("gateway");
  if (!isCloudConfigured) {
    const setup = document.querySelector("#cloud-setup-message");
    setup.hidden = false;
    setup.innerHTML = "<strong>Kurulum tamamlanmayı bekliyor.</strong><span>Supabase proje bilgileri eklendiğinde öğrenci ve öğretmen girişleri açılacak.</span>";
    document.querySelectorAll(".login-submit").forEach(button => { button.disabled = true; });
    return;
  }

  const previewStudentId = new URLSearchParams(window.location.search).get("student-preview");
  if (previewStudentId) {
    const { data: previewAuth } = await cloudClient.auth.getSession();
    if (previewAuth.session && cloudSession?.role === "teacher") {
      await loadTeacherStudentPreview(previewStudentId);
      return;
    }
    setLoginMessage("teacher-login-message", "Öğrenci görünümünü açmak için önce öğretmen hesabınızla giriş yapın.");
    document.querySelector('[data-auth-tab="teacher"]')?.click();
    return;
  }

  if (cloudSession?.role === "student") {
    if (prepareCurrentPlanWeek()) persistStudentStateLocally();
    if (!navigator.onLine) {
      recordDailyAttendance();
      showWorkspace("student");
      renderCurrentPage();
      updateCloudStatus("offline", "Çevrim dışı • yerel kayıt");
      return;
    }
    const { data, error } = await cloudClient.rpc("student_login", {
      p_class_code: cloudSession.classCode,
      p_student_code: cloudSession.studentCode,
      p_name: cloudSession.studentName || ""
    });
    if (!error && data) {
      applyRemotePayload(data.payload, data.studentName, true);
      recordDailyAttendance();
      showWorkspace("student");
      renderCurrentPage();
      await synchronizeStudent();
      return;
    }
    localStorage.removeItem(STORAGE_KEYS.cloudSession);
    cloudSession = null;
  }

  const { data } = await cloudClient.auth.getSession();
  if (data.session && cloudSession?.role === "teacher") {
    showWorkspace("teacher");
    await loadTeacherData();
  }
}

function renderCurrentPage() {
  const titles = { home: "Ana Sayfa", modules: "Modüller", workshop: "Verimli Çalışma Atölyesi", plan: "Haftalık Planım", report: "Gelişim Raporum", badges: "Başarı Rozetlerim", tips: "Öğretmen Tavsiyeleri", settings: "Ayarlar" };
  pageTitle.textContent = state.activeModule
    ? `${state.activeModule}. Hafta`
    : state.activeWorkshopModule
      ? `Atölye • ${state.activeWorkshopModule}. Hafta`
      : titles[state.page];
  studentChipName.textContent = state.settings.studentName.trim() || "Öğrenci";
  applyTheme();

  if (state.page === "modules" && state.activeModule) renderModuleDetail(state.activeModule);
  else if (state.page === "workshop" && state.activeWorkshopModule) renderWorkshopModuleDetail(state.activeWorkshopModule);
  else if (state.page === "home") renderHome();
  else if (state.page === "modules") renderModules();
  else if (state.page === "workshop") renderWorkshop();
  else if (state.page === "plan") renderPlan();
  else if (state.page === "report") renderReport();
  else if (state.page === "badges") renderBadges();
  else if (state.page === "tips") renderTips();
  else if (state.page === "settings") renderSettings();
  enforceStudentPreviewReadOnly();
}

function renderHome() {
  const activeModules = getActiveModules();
  const completedIds = getCompletedIds();
  const nextModule = getNextModule();
  const lastCompleted = getLastCompletedModule();
  const planStats = getPlanStats();
  const overall = activeModules.length ? Math.round((completedIds.length / activeModules.length) * 100) : 0;
  const tip = TEACHER_TIPS[new Date().getDate() % TEACHER_TIPS.length];
  const name = state.settings.studentName.trim();
  const unlockedBadges = BADGES.filter(item => item[3](completedIds)).length;
  const academyScore = Math.round((overall * 0.7) + (planStats.percent * 0.3));
  const readingTracking = getWeeklyTracking();
  const todayReading = getReadingEntryForDate(state, readingTracking.todayKey) || {};
  const readToday = isReadingEntryCompleted(todayReading);
  const recentActivity = Object.entries(state.completed)
    .filter(([, value]) => value?.completedAt)
    .sort((a, b) => new Date(b[1].completedAt) - new Date(a[1].completedAt))
    .slice(0, 3)
    .map(([id, value]) => ({ module: MODULES.find(item => item.id === Number(id)), date: value.completedAt }));

  main.innerHTML = `
    <section class="hero">
      <div class="hero-copy">
        <div class="hero-label"><span>●</span> KİŞİSEL ÖĞRENME ALANIN</div>
        <p class="hero-kicker">${name ? `Merhaba ${escapeHTML(name)}! 👋` : "Akademiye hoş geldin! 👋"}</p>
        <h2>Daha çok değil,<br><em>daha akıllı</em> çalış.</h2>
        <p>Her hafta bir çalışma becerisi kazan, öğrendiğini hemen uygula ve gelişimini somut olarak gör. Küçük adımlar zamanla güçlü bir çalışma düzenine dönüşür.</p>
        <div class="hero-actions">
          <button class="button hero-button" type="button" data-action="open-module" data-module-id="${nextModule?.id || ""}" ${nextModule ? "" : "disabled"}>${completedIds.length ? "Kaldığın Yerden Devam Et" : "Modüllere Başla"} <span>→</span></button>
          <button class="button hero-ghost" type="button" data-page="plan">Haftalık Planım</button>
        </div>
        <div class="hero-trust"><span>✓ Cihazında güvenle saklanır</span><span>✓ Kendi hızında ilerlersin</span></div>
      </div>
      <div class="hero-visual">
        <div class="score-card">
          <div class="score-card-top"><span>Akademi puanın</span><span class="live-dot">GÜNCEL</span></div>
          <div class="score-ring" style="--score:${academyScore * 3.6}deg"><div><strong>${academyScore}</strong><small>/ 100</small></div></div>
          <div class="score-details"><span><b>${completedIds.length}</b> modül</span><span><b>${unlockedBadges}</b> rozet</span><span><b>%${planStats.percent}</b> plan</span></div>
        </div>
      </div>
    </section>

    ${renderNextStudentAction()}

    ${renderWorkshopHomeCard()}

    <section class="home-reading-card ${readToday ? "done" : ""}">
      <div class="home-reading-icon">${readToday ? "✓" : "5"}<small>PARAGRAF</small></div>
      <div class="home-reading-copy"><span class="section-tag">BUGÜNÜN OKUMA GÖREVİ</span><h3>${readToday ? "Bugünkü okuman tamamlandı!" : "Bugün 5 paragraf okumaya hazır mısın?"}</h3><p>Perşembeden Çarşambaya her gün küçük bir okuma adımı. Bu haftaki durumun: <strong>${readingTracking.readingCount}/7 gün</strong>.</p><div class="home-reading-days">${readingTracking.days.map(day => `<span class="${day.reading ? "done" : day.key === readingTracking.todayKey ? "today" : ""}" title="${escapeHTML(formatReadingDay(day.date).weekday)}">${day.reading ? "✓" : formatReadingDay(day.date).weekday.slice(0, 1)}</span>`).join("")}</div></div>
      <div class="home-reading-actions"><a class="button reading-launch" href="https://memet19-coder.github.io/okuma-takip-anlama-atolyesi/" target="_blank" rel="noopener noreferrer" data-action="visit-reading-workshop" data-module-id="${nextModule?.id || ""}">${readToday ? "Yeniden Oku" : "Bugünkü Okumayı Aç"} <span>↗</span></a><button class="button ${readToday ? "secondary" : "primary"}" type="button" data-action="complete-daily-reading" data-module-id="${nextModule?.id || ""}" ${readToday || !nextModule ? "disabled" : ""}>${readToday ? "Bugün Tamamlandı ✓" : "5 Paragrafı Okudum"}</button></div>
    </section>

    ${renderStudentWeeklyTimeline()}

    ${renderHomeWarnings()}

    <div class="stats-grid">
      ${statCard("✅", "Tamamlanan modül", `${completedIds.length} / ${activeModules.length}`, completedIds.length ? "Harika, ilerliyorsun!" : "İlk adımını bekliyor.")}
      ${statCard("📌", "Bu haftaki modül", nextModule ? `${nextModule.id}. Hafta` : "Tüm modüller tamamlandı", nextModule?.title || "Yeni bir modül eklenebilir.")}
      ${statCard("📝", "Son tamamlanan görev", lastCompleted ? lastCompleted.title : "Henüz yok", lastCompleted ? formatDate(state.completed[lastCompleted.id].completedAt) : "İlk görevini tamamlayınca burada görünür.", true)}
      ${statCard("⏱️", "Günlük çalışma hedefi", `${Number(state.settings.dailyGoal) || 30} dakika`, "Küçük ve düzenli adımlar.")}
      ${statCard("💡", "Öğretmen tavsiyesi", tip, "Bugünün küçük hatırlatması.", true)}
      ${statCard("📈", "Genel ilerleme", `%${overall}`, overall === 100 ? "Tüm aktif modüller tamamlandı!" : "Her tamamlanan modül ilerlemeni artırır.")}
    </div>

    <section class="academy-pulse">
      <div class="pulse-heading"><div><span class="section-tag">BU HAFTA</span><h3>Çalışma nabzın</h3><p>Planındaki küçük adımların haftaya nasıl dağıldığını gör.</p></div><button class="button ghost small" type="button" data-page="plan">Planı düzenle →</button></div>
      <div class="week-strip">
        ${state.plan.map(item => {
          const planned = item.subject.trim() || item.topic.trim() || String(item.duration).trim();
          return `<div class="day-pulse ${item.done ? "done" : planned ? "planned" : ""}"><span>${item.day.slice(0, 3)}</span><b>${item.done ? "✓" : planned ? item.duration || "•" : "–"}</b><small>${item.done ? "Tamam" : planned ? "dk." : "Boş"}</small></div>`;
        }).join("")}
      </div>
    </section>

    <div class="dashboard-grid">
      <section class="panel">
        <div class="panel-header"><div><span class="section-tag">SIRADAKİ ADIM</span><h3>Akademi yolculuğun</h3><p>Her tamamlanan modül seni hedefe biraz daha yaklaştırır.</p></div><strong class="big-percent">%${overall}</strong></div>
        <div class="progress-track" aria-label="Genel ilerleme yüzde ${overall}"><div class="progress-fill" style="width:${overall}%"></div></div>
        <div class="next-module">
          <div class="next-module-icon">${nextModule.icon}</div>
          <div class="next-module-copy"><small>${completedIds.length === activeModules.length ? "Tekrar etmek ister misin?" : `${MODULE_EXTRAS[nextModule.id].duration} • Uygulamalı modül`}</small><strong>${nextModule.id}. Hafta: ${nextModule.title}</strong></div>
          <button class="button primary small" type="button" data-action="open-module" data-module-id="${nextModule.id}">Aç</button>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><div><h3>Hızlı ulaş</h3><p>İhtiyacın olan bölüme geç.</p></div></div>
        <div class="quick-actions">
          <button class="quick-action" type="button" data-page="modules"><span>📚</span><strong>10 Modül</strong><small>Becerileri keşfet</small></button>
          <button class="quick-action" type="button" data-page="plan"><span>🗓️</span><strong>Planım</strong><small>%${planStats.percent} tamamlandı</small></button>
          <button class="quick-action" type="button" data-page="report"><span>📈</span><strong>Raporum</strong><small>Öğretmenle paylaş</small></button>
          <button class="quick-action" type="button" data-page="badges"><span>🏅</span><strong>Rozetler</strong><small>${unlockedBadges} rozet açık</small></button>
        </div>
      </section>
    </div>

    <section class="skill-map-section">
      <div class="section-heading"><div><span class="section-tag">BECERİ HARİTASI</span><h2>${activeModules.length} haftalık gelişim rotan</h2><p>Tamamlanan beceriler renklenir. Sıradaki adımın halkayla gösterilir.</p></div><button class="button secondary small" type="button" data-page="modules">Tüm modülleri gör</button></div>
      <div class="skill-map">
        ${getActiveModules().map(module => `<button type="button" class="skill-node ${state.completed[module.id] ? "completed" : module.id === nextModule?.id ? "current" : ""}" data-action="open-module" data-module-id="${module.id}"><span>${state.completed[module.id] ? "✓" : module.icon}</span><small>${module.id}. Hafta</small><b>${module.title.replace("?", "")}</b></button>`).join("")}
      </div>
    </section>

    <div class="dashboard-grid lower-grid">
      <section class="panel activity-panel">
        <div class="panel-header"><div><span class="section-tag">SON HAREKETLER</span><h3>Gelişim günlüğün</h3></div></div>
        ${recentActivity.length ? `<div class="activity-list">${recentActivity.map(item => `<div class="activity-item"><span class="activity-icon">${item.module.icon}</span><div><strong>${item.module.title}</strong><small>${formatDate(item.date)} tarihinde tamamlandı</small></div><span class="activity-check">✓</span></div>`).join("")}</div>` : `<div class="empty-state compact"><span>🌱</span>İlk modülünü tamamladığında gelişim günlüğün burada başlayacak.</div>`}
      </section>
      <section class="panel coach-card"><span class="coach-avatar">🧑‍🏫</span><div><span class="section-tag">ÖĞRETMEN NOTU</span><h3>Bugünün küçük hatırlatması</h3><blockquote>“${tip}”</blockquote><button class="text-button" type="button" data-page="tips">Diğer tavsiyeleri gör →</button></div></section>
    </div>${!studentPreviewMode && !state.onboardingDone ? renderStudentOnboarding() : ""}`;
}

function statCard(icon, label, value, note, textValue = false) {
  return `<article class="stat-card"><span class="stat-icon">${icon}</span><span class="stat-label">${label}</span><strong class="stat-value${textValue ? " text" : ""}">${escapeHTML(value)}</strong><span class="stat-note">${escapeHTML(note)}</span></article>`;
}

function getWorkshopCompletedIds(workshop = state.workshop) {
  return Object.keys(normalizeWorkshopState(workshop).completed).map(Number).filter(id => WORKSHOP_MODULES.some(module => module.id === id));
}

function getWorkshopWeekNumber(workshop = state.workshop, referenceDate = new Date()) {
  const startedValue = normalizeWorkshopState(workshop).startedAt;
  if (!startedValue) return 0;
  const startedAt = new Date(startedValue);
  if (Number.isNaN(startedAt.getTime())) return 0;
  const startDay = new Date(startedAt.getFullYear(), startedAt.getMonth(), startedAt.getDate());
  const currentDay = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  return Math.min(WORKSHOP_MODULES.length, Math.max(1, Math.floor((currentDay - startDay) / (7 * 86400000)) + 1));
}

function getWorkshopSchedule(moduleId, workshop = state.workshop) {
  const startedValue = normalizeWorkshopState(workshop).startedAt;
  if (!startedValue) return null;
  const startedAt = new Date(startedValue);
  if (Number.isNaN(startedAt.getTime())) return null;
  const start = new Date(startedAt.getFullYear(), startedAt.getMonth(), startedAt.getDate());
  start.setDate(start.getDate() + ((Number(moduleId) - 1) * 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start, end };
}

function formatWorkshopSchedule(moduleId, workshop = state.workshop) {
  const schedule = getWorkshopSchedule(moduleId, workshop);
  if (!schedule) return "Başlangıç bekleniyor";
  const formatter = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" });
  return `${formatter.format(schedule.start)} – ${formatter.format(schedule.end)}`;
}

function getWorkshopModuleStatus(moduleId, workshop = state.workshop) {
  const data = normalizeWorkshopState(workshop);
  if (data.completed[moduleId]) return { label: "Tamamlandı", className: "completed" };
  const weekNumber = getWorkshopWeekNumber(data);
  if (!data.startedAt || Number(moduleId) > weekNumber) return { label: "Zamanı gelmedi", className: "locked" };
  const hasWork = Boolean(data.answers[moduleId]) || Boolean(data.checks[moduleId]?.some(Boolean)) || Number.isInteger(data.quizzes[moduleId]?.selected);
  return hasWork ? { label: "Devam ediyor", className: "progress" } : { label: "Başlamaya hazır", className: "available" };
}

function getWorkshopNextModule(workshop = state.workshop) {
  const data = normalizeWorkshopState(workshop);
  const currentWeek = getWorkshopWeekNumber(data);
  return WORKSHOP_MODULES.find(module => module.id <= currentWeek && !data.completed[module.id]) || WORKSHOP_MODULES.find(module => !data.completed[module.id]) || null;
}

function getWorkshopModuleProgress(module, workshop = state.workshop) {
  const data = normalizeWorkshopState(workshop);
  if (data.completed[module.id]) return 100;
  const values = data.answers[module.id]?.values || {};
  const filled = module.fields.filter(field => String(values[field[0]] || "").trim()).length;
  const checked = (data.checks[module.id] || []).filter(Boolean).length;
  const quizPoint = Number.isInteger(data.quizzes[module.id]?.selected) ? 1 : 0;
  return Math.round(((filled + checked + quizPoint) / (module.fields.length + module.checks.length + 1)) * 100);
}

function renderWorkshopHomeCard() {
  const workshop = normalizeWorkshopState(state.workshop);
  const completed = getWorkshopCompletedIds(workshop).length;
  const weekNumber = getWorkshopWeekNumber(workshop);
  const next = getWorkshopNextModule(workshop);
  const percent = Math.round((completed / WORKSHOP_MODULES.length) * 100);
  return `<section class="workshop-home-card ${workshop.startedAt ? "started" : ""}">
    <div class="workshop-home-mark"><span>🧭</span><small>ÖZEL DERS PROGRAMI</small></div>
    <div class="workshop-home-copy"><span class="section-tag">AYRI 10 HAFTALIK GELİŞİM ROTASI</span><h3>Verimli Çalışma Atölyesi</h3><p>${workshop.startedAt ? `Kendi başlangıç tarihine göre <strong>${weekNumber}. haftadasın</strong>. Atölye ilerlemen ana Akademi modüllerinden ayrı kaydedilir.` : "Özel dersler için hazırlanan 10 haftalık atölye programın burada. Başladığın gün sana özel takvimin oluşur."}</p><div class="workshop-home-progress"><span><i style="width:${percent}%"></i></span><strong>${completed}/10 tamamlandı</strong></div></div>
    <button class="button workshop-home-button" type="button" data-page="workshop">${workshop.startedAt ? (next && next.id <= weekNumber ? `${next.id}. Haftaya Devam Et` : "Atölyemi Gör") : "Atölyeyi İncele"} →</button>
  </section>`;
}

function startWorkshopJourney() {
  if (state.workshop.startedAt) return renderWorkshop();
  state.workshop = { ...createEmptyWorkshopState(), startedAt: new Date().toISOString(), lastActivity: new Date().toISOString() };
  saveWorkshopState();
  showToast("Sana özel 10 haftalık atölye takvimin başladı. İlk haftan hazır! 🧭");
  renderWorkshop();
}

function renderWorkshop() {
  const workshop = normalizeWorkshopState(state.workshop);
  const completed = getWorkshopCompletedIds(workshop).length;
  const weekNumber = getWorkshopWeekNumber(workshop);
  const overall = Math.round((completed / WORKSHOP_MODULES.length) * 100);
  const next = getWorkshopNextModule(workshop);

  if (!workshop.startedAt) {
    main.innerHTML = `<section class="workshop-start-hero"><div class="workshop-start-copy"><span class="section-tag">SÜREKLİ ÖZEL DERS PROGRAMI</span><h2>Verimli Çalışma<br><em>Atölyesi</em></h2><p>Öğretmenin 10 haftalık ders akışına göre hazırlanan ayrı çalışma sistemin. Her hafta bir ders açılır; anlatımı inceler, kendini sınar, uygulamanı yapar ve gelişimini kaydedersin.</p><div class="workshop-start-features"><span>✓ Sana özel başlangıç tarihi</span><span>✓ 10 haftalık bağımsız ilerleme</span><span>✓ Öğretmen panelinde canlı takip</span></div>${studentPreviewMode ? `<div class="workshop-preview-empty">Bu öğrenci özel ders atölyesine henüz başlamadı.</div>` : `<button class="button workshop-start-button" type="button" data-action="start-workshop">Atölye Yolculuğumu Başlat →</button>`}</div><div class="workshop-start-map"><span>10</span><strong>HAFTALIK<br>PROGRAM</strong><div>${WORKSHOP_MODULES.slice(0, 5).map(module => `<i>${module.icon}</i>`).join("")}</div></div></section>
      <section class="workshop-program-preview"><div class="section-heading"><div><span class="section-tag">DERS AKIŞI</span><h2>Seni bekleyen 10 hafta</h2><p>Program başladığında her yeni hafta kendi başlangıç tarihine göre açılır.</p></div></div><div class="workshop-preview-grid">${WORKSHOP_MODULES.map(module => `<article><span>${module.icon}</span><small>${module.id}. HAFTA</small><strong>${module.title}</strong></article>`).join("")}</div></section>`;
    return;
  }

  main.innerHTML = `<section class="workshop-dashboard-hero"><div><span class="section-tag">VERİMLİ ÇALIŞMA ATÖLYESİ</span><h2>Kendi hızın, kendi rotan.</h2><p>Programın <strong>${formatDate(workshop.startedAt)}</strong> tarihinde başladı. Bugün ${weekNumber}. haftadasın; önceki açık haftalara istediğin zaman dönebilirsin.</p><div class="workshop-hero-stats"><span><b>${completed}</b> / 10 tamamlandı</span><span><b>${weekNumber}</b>. program haftası</span><span><b>%${overall}</b> genel ilerleme</span></div></div><div class="workshop-compass">🧭<small>${next ? `${next.id}. HAFTA` : "TAMAMLANDI"}</small></div></section>
    <section class="workshop-timeline-panel"><div class="workshop-timeline-heading"><div><span class="section-tag">SANA ÖZEL TAKVİM</span><h3>10 haftalık ders akışın</h3><p>Her hafta başlangıç gününün yıl dönümünde açılır. Kilitli haftaların tarihini kartta görebilirsin.</p></div><strong>${completed}/10</strong></div><div class="progress-track"><div class="progress-fill" style="width:${overall}%"></div></div><div class="workshop-week-flow">${WORKSHOP_MODULES.map(module => {
      const status = getWorkshopModuleStatus(module.id, workshop);
      const progress = getWorkshopModuleProgress(module, workshop);
      const locked = status.className === "locked";
      return `<article class="workshop-module-card ${status.className}"><div class="workshop-module-top"><span class="workshop-week-number">${status.className === "completed" ? "✓" : module.id}</span><span class="status-pill ${status.className}">${locked ? "🔒 " : ""}${status.label}</span></div><div class="workshop-module-icon">${module.icon}</div><small>${module.id}. HAFTA • ${formatWorkshopSchedule(module.id, workshop)}</small><h3>${module.title}</h3><p>${module.short}</p><div class="workshop-card-progress"><span><i style="width:${progress}%"></i></span><small>%${progress}</small></div>${locked ? `<button class="button ghost" type="button" disabled>${formatWorkshopSchedule(module.id, workshop)} tarihinde açılır</button>` : `<button class="button ${status.className === "completed" ? "secondary" : "primary"}" type="button" data-action="open-workshop-module" data-workshop-module-id="${module.id}">${status.className === "completed" ? "Yeniden İncele" : "Haftayı Aç"} →</button>`}</article>`;
    }).join("")}</div></section>`;
}

function renderWorkshopQuiz(module) {
  const quiz = module.quiz;
  const selected = state.workshop.quizzes[module.id]?.selected;
  const answered = Number.isInteger(selected);
  const isCorrect = selected === quiz.answer;
  return `<section class="quiz-card workshop-quiz" id="workshop-quiz-${module.id}"><div class="quiz-heading"><div><span class="section-tag">MİNİ BİLGİ KONTROLÜ</span><h3>🧠 Kendini sına</h3><p>${quiz.question}</p></div><span class="quiz-badge">1 soru</span></div><div class="quiz-options">${quiz.options.map((option, index) => {
    const optionClass = answered && index === quiz.answer ? "correct" : answered && index === selected ? "wrong" : "";
    return `<button class="quiz-option ${optionClass}" type="button" data-action="workshop-quiz-option" data-workshop-module-id="${module.id}" data-option-index="${index}" aria-pressed="${selected === index}"><span>${String.fromCharCode(65 + index)}</span><b>${option}</b>${optionClass === "correct" ? "<i>✓</i>" : optionClass === "wrong" ? "<i>×</i>" : ""}</button>`;
  }).join("")}</div><div class="quiz-feedback ${answered ? `show ${isCorrect ? "success" : "retry"}` : ""}">${answered ? `<strong>${isCorrect ? "Harika, yöntemi yakaladın!" : "Güzel bir deneme. İpucuna bakalım:"}</strong><p>${quiz.explanation}</p>` : ""}</div></section>`;
}

function renderWorkshopModuleDetail(moduleId) {
  const module = WORKSHOP_MODULES.find(item => item.id === Number(moduleId));
  if (!module) return navigate("workshop");
  const status = getWorkshopModuleStatus(module.id);
  if (status.className === "locked") {
    showToast(`${module.id}. hafta ${formatWorkshopSchedule(module.id)} tarihinde açılacak.`, "error");
    return navigate("workshop");
  }
  const answerRecord = state.workshop.answers[module.id]?.values || {};
  const savedChecks = state.workshop.checks[module.id] || [];
  const progress = getWorkshopModuleProgress(module);
  const currentIndex = WORKSHOP_MODULES.findIndex(item => item.id === module.id);
  const previous = WORKSHOP_MODULES[currentIndex - 1];
  const next = WORKSHOP_MODULES[currentIndex + 1];
  const nextOpen = next && getWorkshopModuleStatus(next.id).className !== "locked";
  main.innerHTML = `<article class="module-detail workshop-detail"><button class="button ghost small back-button" type="button" data-action="back-workshop">← Atölye programım</button><header class="workshop-module-banner"><div><span class="section-tag">VERİMLİ ÇALIŞMA ATÖLYESİ • ${module.id}. HAFTA</span><h2>${module.icon} ${module.title}</h2><p>${module.short}</p><div class="workshop-banner-meta"><span>📅 ${formatWorkshopSchedule(module.id)}</span><span>✏️ ${module.fields.length} uygulama sorusu</span><span>✓ ${module.checks.length} kontrol adımı</span></div></div><div class="workshop-progress-orbit"><strong>%${progress}</strong><small>HAFTA İLERLEMESİ</small></div></header>
    <nav class="learning-route workshop-route" aria-label="Atölye öğrenme rotası">${[["1", "Keşfet"], ["2", "Öğren"], ["3", "Hikâyeyi gör"], ["4", "Kendini sına"], ["5", "Uygula"]].map((step, index) => `<div class="route-step ${progress >= (index + 1) * 20 ? "done" : index === 0 ? "active" : ""}"><span>${progress >= (index + 1) * 20 ? "✓" : step[0]}</span><b>${step[1]}</b>${index < 4 ? "<i></i>" : ""}</div>`).join("")}</nav>
    <section class="content-section workshop-why"><div class="workshop-section-label">01</div><div><span class="section-tag">NEDEN ÖNEMLİ?</span><h3>${module.title}</h3><p>${module.description}</p></div></section><section class="content-section goal-box"><h3><span>🎯</span> Bu haftanın hedefi</h3><p>${module.goal}</p></section><section class="content-section"><h3><span>🧑‍🏫</span> Dersin üç ana fikri</h3><div class="lesson-points">${module.lesson.map(point => `<div class="lesson-point"><span>${point[0]}</span><strong>${point[1]}</strong><p>${point[2]}</p></div>`).join("")}</div></section><section class="content-section method-section"><div class="section-number">02</div><div class="section-copy"><span class="section-tag">UYGULAMA YOLU</span><h3><span>🪜</span> Adım adım dene</h3><div class="method-steps">${module.steps.map((step, index) => `<div class="method-step"><span>${index + 1}</span><p>${step}</p></div>`).join("")}</div></div></section><section class="content-section story-box anecdote-box workshop-story"><div class="anecdote-heading"><span class="anecdote-icon">📖</span><div><span class="section-tag">DERSİN HİKÂYESİ</span><h3>${module.story.title}</h3></div></div><div class="anecdote-body">${module.story.paragraphs.map((paragraph, index) => `<p><span>${index + 1}</span>${paragraph}</p>`).join("")}</div><div class="anecdote-takeaway"><span>💡</span><p><strong>Buradan çıkaracağın ders:</strong>${module.story.takeaway}</p></div></section>${renderWorkshopQuiz(module)}<section class="content-section task-box workshop-task"><h3><span>🧪</span> Bu haftanın uygulaması</h3><p>${module.task}</p></section>
    <form class="module-form workshop-form" id="workshop-module-form" data-workshop-module-id="${module.id}" novalidate><section class="content-section"><h3><span>✏️</span> Kendi çalışma dosyam</h3><p class="workshop-form-intro">Cevapların öğretmen panelinde yalnızca sana ait gelişim dosyasında görünür.</p>${module.fields.map(field => renderField(field, answerRecord[field[0]])).join("")}</section><section class="content-section"><h3><span>✅</span> Haftalık kontrol listem</h3><div class="check-list">${module.checks.map((label, index) => `<label class="check-item"><input type="checkbox" name="workshop-check-${index}" ${savedChecks[index] ? "checked" : ""}><span>${label}</span></label>`).join("")}</div></section><div id="workshop-module-message" class="helper-message" role="alert"></div><div class="form-actions"><button class="button ghost" type="button" data-action="save-workshop-draft">Taslağı Kaydet</button><button class="button primary workshop-complete-button" type="submit">${state.workshop.completed[module.id] ? "Cevaplarımı Güncelle" : "Bu Haftayı Tamamla"} ✨</button></div></form>
    <nav class="module-footer-nav">${previous ? `<button class="module-jump previous" type="button" data-action="open-workshop-module" data-workshop-module-id="${previous.id}"><span>← Önceki hafta</span><strong>${previous.title}</strong></button>` : "<div></div>"}${nextOpen ? `<button class="module-jump next" type="button" data-action="open-workshop-module" data-workshop-module-id="${next.id}"><span>Sonraki hafta →</span><strong>${next.title}</strong></button>` : next ? `<div class="workshop-next-locked"><span>🔒 Sonraki hafta</span><strong>${formatWorkshopSchedule(next.id)} tarihinde açılır</strong></div>` : `<button class="module-jump next" type="button" data-action="back-workshop"><span>Program sonucu →</span><strong>10 Haftalık Rotam</strong></button>`}</nav></article>`;
}

function collectWorkshopForm(form) {
  const module = WORKSHOP_MODULES.find(item => item.id === Number(form.dataset.workshopModuleId));
  const values = {};
  module.fields.forEach(field => { values[field[0]] = form.elements[field[0]].value.trim(); });
  const checks = module.checks.map((_, index) => form.elements[`workshop-check-${index}`].checked);
  return { module, values, checks };
}

function showWorkshopMessage(message) {
  const element = document.querySelector("#workshop-module-message");
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("show", Boolean(message));
}

function saveWorkshopDraft(form) {
  if (!form) return false;
  const { module, values, checks } = collectWorkshopForm(form);
  const hasValue = Object.values(values).some(value => value.trim()) || checks.some(Boolean);
  if (!hasValue) {
    showWorkshopMessage("Önce en az bir cevap yazabilir veya bir kontrol maddesini işaretleyebilirsin.");
    return false;
  }
  const now = new Date().toISOString();
  state.workshop.answers[module.id] = { values, savedAt: now };
  state.workshop.checks[module.id] = checks;
  state.workshop.lastActivity = now;
  saveWorkshopState();
  showWorkshopMessage("");
  return true;
}

function completeWorkshopModule(form) {
  const { module, values, checks } = collectWorkshopForm(form);
  const emptyField = module.fields.find(field => !values[field[0]]);
  if (emptyField) {
    showWorkshopMessage(`“${emptyField[1]}” alanına kısa bir cevap ekleyebilir misin?`);
    form.elements[emptyField[0]].focus();
    return;
  }
  if (!Number.isInteger(state.workshop.quizzes[module.id]?.selected)) {
    showWorkshopMessage("Haftayı tamamlamadan önce mini bilgi kontrolündeki bir seçeneği dene.");
    document.querySelector(`#workshop-quiz-${module.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (!checks.every(Boolean)) {
    showWorkshopMessage("Hazır olduğun kontrol maddelerinin tümünü gözden geçirip işaretleyebilirsin.");
    return;
  }
  const now = new Date().toISOString();
  state.workshop.answers[module.id] = { values, savedAt: now };
  state.workshop.checks[module.id] = checks;
  state.workshop.completed[module.id] = state.workshop.completed[module.id] || { completedAt: now };
  state.workshop.lastActivity = now;
  saveWorkshopState();
  showToast(`${module.id}. atölye haftasını tamamladın. Harika bir adım! 🎉`);
  renderWorkshopModuleDetail(module.id);
}

function handleWorkshopQuiz(moduleId, selected) {
  const module = WORKSHOP_MODULES.find(item => item.id === Number(moduleId));
  if (!module || !Number.isInteger(selected)) return;
  const now = new Date().toISOString();
  state.workshop.quizzes[module.id] = { selected, answeredAt: now };
  state.workshop.lastActivity = now;
  saveWorkshopState();
  const element = document.querySelector(`#workshop-quiz-${module.id}`);
  if (element) element.outerHTML = renderWorkshopQuiz(module);
  if (selected === module.quiz.answer) showToast("Doğru cevap! Bu haftanın ana fikrini yakaladın. 🌟");
}

function renderModules() {
  const activeModules = getActiveModules();
  const completed = getCompletedIds().length;
  main.innerHTML = `
    <section class="page-intro"><div><h2>${activeModules.length} güçlü beceriyle ilerle</h2><p>Modülleri sırayla ilerletebilir ya da bugün en çok ihtiyacın olan konuyu seçebilirsin. Her görev küçük bir adım olarak tasarlandı.</p></div><div class="intro-icon" aria-hidden="true">📚</div></section>
    <div class="progress-line"><span>Akademi ilerlemen</span><strong>${completed} / ${activeModules.length} modül</strong></div>
    <div class="progress-track" aria-label="Modüllerin yüzde ${activeModules.length ? Math.round((completed / activeModules.length) * 100) : 0} kadarı tamamlandı"><div class="progress-fill" style="width:${activeModules.length ? Math.round((completed / activeModules.length) * 100) : 0}%"></div></div>
    <div class="section-heading"><div><h2>Tüm modüller</h2><p>Bir kart seç ve kendi hızında ilerle.</p></div></div>
    <div class="module-grid">
      ${getActiveModules().map(module => {
        const status = getModuleStatus(module.id);
        return `<article class="module-card module-accent-${((module.id - 1) % 5) + 1} ${status.className === "completed" ? "completed" : ""}">
          <div class="module-card-top"><span class="module-number">${status.className === "completed" ? "✓" : module.id}</span><span class="status-pill ${status.className}">${status.label}</span></div>
          <div class="module-card-meta"><span>${module.icon} ${MODULE_EXTRAS[module.id].duration}</span><span>5 bölüm</span></div>
          <h3>${module.title}</h3><p>${module.short}</p>
          <div class="module-mini-progress"><span><i style="width:${status.className === "completed" ? 100 : status.className === "progress" ? 45 : 8}%"></i></span><small>${status.className === "completed" ? "Tamamlandı" : status.className === "progress" ? "Çalışma sürüyor" : "Başlamaya hazır"}</small></div>
          <button class="button ${status.className === "completed" ? "secondary" : "primary"}" type="button" data-action="open-module" data-module-id="${module.id}">${status.className === "completed" ? "Yeniden İncele" : "Modülü Aç"} <span>→</span></button>
        </article>`;
      }).join("")}
    </div>`;
}

function renderModuleDetail(moduleId) {
  const module = getModuleById(moduleId);
  if (!module || module.active === false) return navigate("modules");
  const extra = MODULE_EXTRAS[module.id];
  const anecdote = MODULE_ANECDOTES[module.id];
  const answerRecord = state.answers[module.id]?.values || {};
  const savedChecks = state.checks[module.id] || [];
  const quizRecord = state.quizzes[module.id];
  const activityRecord = state.activities[module.id] || {};
  const status = getModuleStatus(module.id);
  const checkedCount = savedChecks.filter(Boolean).length;
  const filledCount = module.fields.filter(field => String(answerRecord[field[0]] || "").trim()).length;
  const quizPoint = Number.isInteger(quizRecord?.selected) ? 1 : 0;
  const labPoint = state.completed[module.id] || Object.keys(activityRecord.choices || {}).length === ACTIVITY_LABS[module.id].items.length ? 1 : 0;
  const readingPoint = state.completed[module.id] || hasReadingForModule(module.id) ? 1 : 0;
  const progress = Math.round(((checkedCount + filledCount + quizPoint + labPoint + readingPoint) / (module.checks.length + module.fields.length + 3)) * 100);
  const routeStage = getModuleRouteStage(module.id);

  main.innerHTML = `<article class="module-detail">
    <button class="button ghost small back-button" type="button" data-action="back-modules">← Tüm modüller</button>
    <header class="module-banner module-accent-${((module.id - 1) % 5) + 1}">
      <div class="module-banner-top"><div><p class="module-banner-kicker">${module.id}. HAFTA • ${module.icon} ÇALIŞMA BECERİSİ</p><h2>${module.title}</h2></div><span class="status-pill">${status.label}</span></div>
      <div class="module-banner-meta"><span>◷ ${extra.duration}</span><span>▤ 5 öğrenme bölümü</span><span>✦ Uygulamalı görev</span></div>
      <div class="module-progress"><div class="progress-line"><span>Bu modüldeki ilerlemen</span><strong>%${progress}</strong></div><div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div></div>
    </header>

    <nav class="learning-route" aria-label="Modül öğrenme rotası">
      ${[["1", "Keşfet"], ["2", "Öğren"], ["3", "Örneği gör"], ["4", "Kendini sına"], ["5", "Uygula"]].map((step, index) => `<div class="route-step ${index + 1 < routeStage ? "done" : index + 1 === routeStage ? "active" : ""}"><span>${index + 1 < routeStage ? "✓" : step[0]}</span><b>${step[1]}</b>${index < 4 ? "<i></i>" : ""}</div>`).join("")}
    </nav>

    <section class="warmup-card"><div class="warmup-icon">💭</div><div><span class="section-tag">BAŞLAMADAN DÜŞÜN</span><h3>Kendine kısa bir soru sor</h3><p>${extra.warmup}</p><small>Cevabını zihninden geçirmen yeterli. Burada doğru veya yanlış yok.</small></div></section>

    <section class="content-section"><h3><span>👋</span> Neden önemli?</h3><p>${module.description}</p></section>
    <section class="content-section goal-box"><h3><span>🎯</span> Öğrenme hedefin</h3><p>${module.goal}</p></section>
    <section class="content-section"><h3><span>🧑‍🏫</span> Birlikte öğrenelim</h3><p>Bu beceriyi uygularken şu üç noktayı aklında tut:</p><div class="lesson-points">${module.lesson.map(point => `<div class="lesson-point"><span>${point[0]}</span><strong>${point[1]}</strong><p>${point[2]}</p></div>`).join("")}</div></section>
    <section class="content-section method-section"><div class="section-number">02</div><div class="section-copy"><span class="section-tag">UYGULAMA YÖNTEMİ</span><h3><span>🪜</span> Bu beceriyi 4 adımda kullan</h3><div class="method-steps">${extra.steps.map((step, index) => `<div class="method-step"><span>${index + 1}</span><p>${step}</p></div>`).join("")}</div></div></section>
    <section class="content-section story-box anecdote-box"><div class="anecdote-heading"><span class="anecdote-icon">📖</span><div><span class="section-tag">KISA BİR HİKÂYE, GÜÇLÜ BİR DERS</span><h3>${anecdote.title}</h3></div></div><div class="anecdote-body">${anecdote.paragraphs.map((paragraph, index) => `<p><span>${index + 1}</span>${paragraph}</p>`).join("")}</div><div class="anecdote-takeaway"><span>💡</span><p><strong>Bu hikâyenin bize söylediği:</strong>${anecdote.takeaway}</p></div></section>
    <div class="insight-grid">
      <section class="insight-card power"><span class="insight-icon">⚡</span><div><span class="section-tag">GÜÇLÜ İPUCU</span><h3>Bunu dene</h3><p>${extra.powerTip}</p></div></section>
      <section class="insight-card caution"><span class="insight-icon">⚠️</span><div><span class="section-tag">SIK YAPILAN HATA</span><h3>Buna dikkat et</h3><p>${extra.commonMistake}</p></div></section>
    </div>
    ${renderInteractiveLab(module.id)}
    ${renderModuleQuiz(module.id)}
    <section class="content-section task-box"><h3><span>🧩</span> Küçük uygulaman</h3><p>${module.task}</p></section>

    <form class="module-form" id="module-form" data-module-id="${module.id}" novalidate>
      <section class="content-section"><h3><span>✏️</span> Kendi cevabım</h3><p style="color:var(--muted);margin-bottom:20px">Kendi düşüncelerini yaz. Doğru ya da yanlış cevap yok; bu alan sana ait.</p>
        ${module.fields.map(field => renderField(field, answerRecord[field[0]])).join("")}
      </section>
      <section class="content-section"><h3><span>✅</span> Kontrol listem</h3><p style="color:var(--muted);margin-bottom:18px">Hazır olduğun maddeleri işaretle.</p><div class="check-list">
        ${module.checks.map((label, index) => `<label class="check-item"><input type="checkbox" name="check-${index}" ${savedChecks[index] ? "checked" : ""}><span>${label}</span></label>`).join("")}
      </div></section>
      ${renderReadingMission(module.id)}
      <div id="module-message" class="helper-message" role="alert"></div>
      <div class="form-actions"><button class="button ghost" type="button" data-action="save-draft">Taslağı Kaydet</button><button class="button primary" type="submit">${state.completed[module.id] ? "Cevaplarımı Güncelle" : "Modülü Tamamla"} ✨</button></div>
    </form>
    <nav class="module-footer-nav" aria-label="Modüller arası geçiş">
      ${(() => { const modules = getActiveModules(); const index = modules.findIndex(item => item.id === module.id); const previous = modules[index - 1]; return previous ? `<button class="module-jump previous" type="button" data-action="open-module" data-module-id="${previous.id}"><span>← Önceki modül</span><strong>${previous.title}</strong></button>` : "<div></div>"; })()}
      ${(() => { const modules = getActiveModules(); const index = modules.findIndex(item => item.id === module.id); const next = modules[index + 1]; return next ? `<button class="module-jump next" type="button" data-action="open-module" data-module-id="${next.id}"><span>Sonraki modül →</span><strong>${next.title}</strong></button>` : `<button class="module-jump next" type="button" data-page="badges"><span>Akademi sonucu →</span><strong>Rozetlerimi Gör</strong></button>`; })()}
    </nav>
  </article>`;
}

function renderReadingMission(moduleId) {
  const tracking = getWeeklyTracking();
  const validTarget = readingTargetDateKey && tracking.days.some(day => day.key === readingTargetDateKey && day.key <= tracking.todayKey);
  const targetDateKey = validTarget ? readingTargetDateKey : tracking.todayKey;
  const targetDay = tracking.days.find(day => day.key === targetDateKey) || tracking.days[0];
  const targetEntry = getReadingEntryForDate(state, targetDateKey) || {};
  const targetIsToday = targetDateKey === tracking.todayKey;
  const targetIsPast = targetDateKey < tracking.todayKey;
  const visitedTarget = Boolean(targetEntry.visitedAt);
  const completedTarget = isReadingEntryCompleted(targetEntry);
  const weekCompleted = tracking.readingCount === 7;
  const rangeLabel = `${new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long" }).format(tracking.start)} – ${new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long" }).format(tracking.end)}`;
  const targetLabel = formatReadingDay(targetDay.date);
  return `<section class="reading-mission ${completedTarget ? "completed" : ""} ${weekCompleted ? "week-complete" : ""}" id="reading-mission-${moduleId}">
    <div class="reading-mission-visual"><span>5</span><small>HER GÜN PARAGRAF</small><i>📚</i><b>${tracking.readingCount}/7 gün</b></div>
    <div class="reading-mission-content">
      <span class="section-tag">PERŞEMBEDEN ÇARŞAMBAYA GÜNLÜK OKUMA</span>
      <h3>Her gün 5 paragraf, küçük ama güçlü bir alışkanlık</h3>
      <p><strong>${rangeLabel}</strong> tarihleri arasında her gün Okuma Atölyesi’ne girip <strong>5 paragraf</strong> oku. Bir günü kaçırırsan o günü sonradan telafi edebilirsin; telafi edilen kayıtlar kırmızı görünür.</p>
      <div class="reading-week-summary"><span>Bu haftaki ilerlemen</span><strong>${tracking.readingCount} / 7 gün</strong></div>
      <div class="reading-week-grid">${tracking.days.map(day => {
        const labels = formatReadingDay(day.date);
        const isToday = day.key === tracking.todayKey;
        const isPast = day.key < tracking.todayKey;
        const isSelected = day.key === targetDateKey;
        const status = day.reading ? (day.late ? "late" : "done") : isToday ? "today" : isPast ? "missed" : "locked";
        const statusText = day.reading ? (day.late ? "↺ Telafi edildi" : "✓ Okundu") : isToday ? "Bugün" : isPast ? "Kaçırıldı • Telafi et" : "Kilitli";
        const dayButton = !isPast && !isToday ? `<div class="reading-day ${status} ${isSelected ? "selected" : ""}" aria-label="${escapeHTML(labels.weekday)} ${escapeHTML(labels.date)}: ${statusText}"><span>${escapeHTML(labels.weekday)}</span><strong>${escapeHTML(labels.date)}</strong><small>${statusText}</small></div>` : `<button type="button" class="reading-day ${status} ${isSelected ? "selected" : ""}" data-action="select-reading-day" data-module-id="${moduleId}" data-reading-date="${day.key}" aria-label="${escapeHTML(labels.weekday)} ${escapeHTML(labels.date)}: ${statusText}"><span>${escapeHTML(labels.weekday)}</span><strong>${escapeHTML(labels.date)}</strong><small>${statusText}</small></button>`;
        return dayButton;
      }).join("")}</div>
      <ol><li>${targetIsToday ? "Bugünkü" : `${targetLabel.weekday} ${targetLabel.date} tarihindeki`} okumayı seç.</li><li>Okuma Atölyesi’ni açıp 5 paragraf oku.</li><li>Buraya dönüp seçtiğin günün kaydını tamamla.</li></ol>
      <div class="reading-selected-note ${targetIsPast ? "late" : ""}"><strong>${targetIsPast ? "Telafi günü:" : "Seçilen gün:"}</strong> ${escapeHTML(targetLabel.weekday)} ${escapeHTML(targetLabel.date)}${targetIsPast ? " • Bugün okursan kırmızı telafi kaydı oluşur." : ""}</div>
      <div class="reading-mission-actions"><a class="button reading-launch" href="https://memet19-coder.github.io/okuma-takip-anlama-atolyesi/" target="_blank" rel="noopener noreferrer" data-action="visit-reading-workshop" data-module-id="${moduleId}" data-reading-date="${targetDateKey}">${targetIsPast ? "Telafi Okumasını Aç" : "Bugünkü Okumayı Aç"} <span>↗</span></a><button class="reading-confirmation ${completedTarget ? (targetEntry.late ? "late done" : "done") : ""}" type="button" data-action="complete-daily-reading" data-module-id="${moduleId}" data-reading-date="${targetDateKey}" ${completedTarget || !visitedTarget ? "disabled" : ""}><span class="reading-check">${completedTarget ? "✓" : "□"}</span><span><b>${completedTarget ? (targetEntry.late ? "Telafi kaydı tamamlandı" : "Bu gün tamamlandı") : visitedTarget ? `${targetIsPast ? "Telafiyi" : "5 paragrafı"} okudum` : "Önce Okuma Atölyesi’ni aç"}</b><small>${completedTarget ? `${formatDate(targetEntry.completedAt)} tarihinde kaydedildi.${targetEntry.late ? " Geç okuma olarak işaretlendi." : ""}` : visitedTarget ? "Okumanı bitirdiysen bu günün kaydını tamamla." : "Düğme, Okuma Atölyesi’ni açtıktan sonra etkinleşir."}</small></span></button></div>
    </div>
  </section>`;
}

function renderInteractiveLab(moduleId) {
  const lab = ACTIVITY_LABS[moduleId];
  const record = state.activities[moduleId] || { choices: {}, missionDays: [] };
  const choices = record.choices || {};
  const answered = Object.keys(choices).length;
  const correct = lab.items.filter((item, index) => choices[index] === item[1]).length;
  const completed = answered === lab.items.length;
  return `<section class="activity-lab" id="activity-lab-${moduleId}">
    <div class="activity-lab-header"><div class="activity-lab-icon">${lab.icon}</div><div><span class="section-tag">ETKİLEŞİMLİ BECERİ ATÖLYESİ</span><h3>${lab.title}</h3><p>${lab.instruction}</p></div><div class="lab-score"><strong>${correct}/${lab.items.length}</strong><small>${completed ? "tamamlandı" : "doğru"}</small></div></div>
    <div class="confidence-panel"><div><strong>Başlamadan önce bu konuda kendine kaç puan verirsin?</strong><small>1: Henüz emin değilim • 5: Kendime güveniyorum</small></div><div class="confidence-scale">${[1,2,3,4,5].map(value => `<button type="button" class="confidence-button ${record.confidenceBefore === value ? "active" : ""}" data-action="activity-confidence" data-stage="before" data-value="${value}" data-module-id="${moduleId}">${value}</button>`).join("")}</div></div>
    <div class="classification-list">${lab.items.map((item, index) => {
      const selected = choices[index];
      const isCorrect = selected === item[1];
      return `<article class="classification-card ${selected ? isCorrect ? "correct" : "wrong" : ""}"><div class="classification-number">${index + 1}</div><div class="classification-content"><strong>${item[0]}</strong><div class="classification-options">${lab.categories.map(category => `<button type="button" class="classification-option ${selected === category ? "selected" : ""}" data-action="activity-choice" data-module-id="${moduleId}" data-item-index="${index}" data-category="${escapeHTML(category)}">${category}</button>`).join("")}</div>${selected ? `<div class="classification-feedback"><b>${isCorrect ? "✓ Doğru karar" : `Doğru cevap: ${item[1]}`}</b><span>${item[2]}</span></div>` : ""}</div></article>`;
    }).join("")}</div>
    ${completed ? `<div class="lab-complete-banner"><span>🎉</span><div><strong>Atölyeyi tamamladın!</strong><p>${correct === lab.items.length ? "Bütün kararların doğru. Harika bir dikkat gösterdin." : "Geri bildirimlere bakarak yanlış kararlarını yeniden deneyebilirsin."}</p></div></div>` : ""}
    <div class="mission-card"><div class="mission-copy"><span class="section-tag">7 GÜNLÜK GERÇEK HAYAT GÖREVİ</span><h4>${lab.mission}</h4><p>Görevi denediğin günleri işaretle. Bir gün bile başlaman değerlidir.</p></div><div class="mission-days">${[0,1,2,3,4,5,6].map(day => `<button type="button" class="mission-day ${record.missionDays?.[day] ? "done" : ""}" data-action="activity-day" data-module-id="${moduleId}" data-day-index="${day}"><span>${day + 1}</span><small>Gün</small></button>`).join("")}</div></div>
    <div class="activity-reflection"><div class="field-group"><label for="activity-reflection-${moduleId}">Bu etkinlikten sonra fark ettiğim şey</label><textarea id="activity-reflection-${moduleId}" placeholder="Kısa bir düşünce yazabilirsin…">${escapeHTML(record.reflection || "")}</textarea></div><div><span>Etkinlikten sonra kendine verdiğin puan</span><div class="confidence-scale">${[1,2,3,4,5].map(value => `<button type="button" class="confidence-button ${record.confidenceAfter === value ? "active" : ""}" data-action="activity-confidence" data-stage="after" data-value="${value}" data-module-id="${moduleId}">${value}</button>`).join("")}</div><button class="button secondary small" type="button" data-action="save-activity-reflection" data-module-id="${moduleId}">Düşüncemi Kaydet</button></div></div>
  </section>`;
}

function renderModuleQuiz(moduleId) {
  const quiz = MODULE_EXTRAS[moduleId].quiz;
  const selected = state.quizzes[moduleId]?.selected;
  const answered = Number.isInteger(selected);
  const isCorrect = selected === quiz.answer;
  return `<section class="quiz-card" id="module-quiz-${moduleId}">
    <div class="quiz-heading"><div><span class="section-tag">MİNİ BİLGİ KONTROLÜ</span><h3>🧠 Kendini sına</h3><p>${quiz.question}</p></div><span class="quiz-badge">1 soru</span></div>
    <div class="quiz-options">${quiz.options.map((option, index) => {
      const optionClass = answered && index === quiz.answer ? "correct" : answered && index === selected ? "wrong" : "";
      return `<button class="quiz-option ${optionClass}" type="button" data-action="quiz-option" data-module-id="${moduleId}" data-option-index="${index}" aria-pressed="${selected === index}"><span>${String.fromCharCode(65 + index)}</span><b>${option}</b>${optionClass === "correct" ? "<i>✓</i>" : optionClass === "wrong" ? "<i>×</i>" : ""}</button>`;
    }).join("")}</div>
    <div class="quiz-feedback ${answered ? `show ${isCorrect ? "success" : "retry"}` : ""}" aria-live="polite">${answered ? `<strong>${isCorrect ? "Harika, doğru düşündün!" : "Güzel bir deneme. Birlikte bakalım:"}</strong><p>${quiz.explanation}</p>` : ""}</div>
  </section>`;
}

function renderField(field, value = "") {
  const [id, label, type, placeholder, options] = field;
  const safeValue = escapeHTML(value);
  let input;
  if (type === "textarea") input = `<textarea id="${id}" name="${id}" placeholder="${escapeHTML(placeholder)}">${safeValue}</textarea>`;
  else if (type === "select") input = `<select id="${id}" name="${id}"><option value="">${escapeHTML(placeholder)}</option>${options.map(option => `<option value="${escapeHTML(option)}" ${option === value ? "selected" : ""}>${escapeHTML(option)}</option>`).join("")}</select>`;
  else input = `<input id="${id}" name="${id}" type="${type}" value="${safeValue}" placeholder="${escapeHTML(placeholder)}" ${type === "number" ? 'min="0" inputmode="numeric"' : ""}>`;
  return `<div class="field-group"><label for="${id}">${label}</label>${input}</div>`;
}

function collectModuleForm(form) {
  const module = MODULES.find(item => item.id === Number(form.dataset.moduleId));
  const values = {};
  module.fields.forEach(field => { values[field[0]] = form.elements[field[0]].value.trim(); });
  const checks = module.checks.map((_, index) => form.elements[`check-${index}`].checked);
  return { module, values, checks };
}

function saveModuleDraft(form) {
  const { module, values, checks } = collectModuleForm(form);
  const hasValue = Object.values(values).some(value => value.trim()) || checks.some(Boolean);
  if (!hasValue) {
    showModuleMessage("Önce en az bir cevap yazabilir veya bir maddeyi işaretleyebilirsin.");
    return false;
  }
  state.answers[module.id] = { values, savedAt: new Date().toISOString() };
  state.checks[module.id] = checks;
  saveData(STORAGE_KEYS.answers, state.answers);
  saveData(STORAGE_KEYS.checks, state.checks);
  showModuleMessage("");
  return true;
}

function completeModule(form) {
  const { module, values, checks } = collectModuleForm(form);
  const emptyField = module.fields.find(field => !values[field[0]]);
  if (emptyField) {
    showModuleMessage(`“${emptyField[1]}” alanına kısa bir cevap ekleyebilir misin?`);
    form.elements[emptyField[0]].focus();
    return;
  }
  if (!checks.every(Boolean)) {
    showModuleMessage("Tamamlamadan önce kontrol listendeki maddelere tekrar göz atıp hazır olanları işaretleyebilirsin.");
    return;
  }
  const labCompleted = Object.keys(state.activities[module.id]?.choices || {}).length === ACTIVITY_LABS[module.id].items.length;
  if (!state.completed[module.id] && !labCompleted) {
    showModuleMessage("Modülü tamamlamadan önce etkileşimli beceri atölyesindeki üç kararı da denemeni rica ediyorum.");
    document.querySelector(`#activity-lab-${module.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (!Number.isInteger(state.quizzes[module.id]?.selected)) {
    showModuleMessage("Modülü tamamlamadan önce mini bilgi kontrolündeki seçeneklerden birini denemeni rica ediyorum.");
    document.querySelector(`#module-quiz-${module.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (!state.completed[module.id] && !hasReadingForModule(module.id)) {
    showModuleMessage("Modülü tamamlamadan önce bugünün Okuma Atölyesi görevinde 5 paragraf okuyup günlük kaydını tamamlamanı rica ediyorum.");
    document.querySelector(`#reading-mission-${module.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  state.answers[module.id] = { values, savedAt: new Date().toISOString() };
  state.checks[module.id] = checks;
  state.completed[module.id] = { completedAt: new Date().toISOString() };
  saveData(STORAGE_KEYS.answers, state.answers);
  saveData(STORAGE_KEYS.checks, state.checks);
  saveData(STORAGE_KEYS.completed, state.completed);
  showToast(`Harika! ${module.id}. modülü tamamladın. Yeni bir rozet kazanmış olabilirsin! 🎉`);
  renderModuleDetail(module.id);
}

function showModuleMessage(message) {
  const element = document.querySelector("#module-message");
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("show", Boolean(message));
}

function renderPlan() {
  const stats = getPlanStats();
  const dayIcons = ["🌱", "⚡", "🧠", "🎯", "✨", "🌤️", "🌿"];
  main.innerHTML = `
    <section class="page-intro"><div><h2>Her güne istediğin kadar görev ekle</h2><p>Aynı gün içinde birden fazla derse çalışabilirsin. Her dersin arasına kısa bir mola koy; bir görevi bitirince diğerine geç.</p></div><div class="intro-icon" aria-hidden="true">🗓️</div></section>
    <section class="plan-coach">
      <div><span class="section-tag">PLANLAMA ASİSTANI</span><h3>Dengeli bir hafta için 3 küçük kural</h3></div>
      <div class="plan-rule"><span>01</span><p><strong>Sırayla ilerle</strong>Üç ders ekleyebilirsin; aynı anda değil, birini bitirip diğerine geç.</p></div>
      <div class="plan-rule"><span>02</span><p><strong>Dersler arasına mola koy</strong>25–30 dakika çalıştıktan sonra 5–10 dakika dinlen.</p></div>
      <div class="plan-rule"><span>03</span><p><strong>Gerçekçi kal</strong>Yorucu bir güne daha az, rahat bir güne daha çok görev ekleyebilirsin.</p></div>
    </section>
    <div class="plan-summary">
      <div class="mini-stat"><span>Planlanan gün</span><strong>${stats.plannedDays} / 7</strong></div>
      <div class="mini-stat"><span>Tamamlanan görev</span><strong>${stats.completed} / ${stats.planned}</strong></div>
      <div class="mini-stat"><span>Çalışma + mola</span><strong>${stats.minutes} + ${stats.breakMinutes} dk.</strong></div>
      <div class="mini-stat"><span>Haftalık ilerleme</span><strong>%${stats.percent}</strong></div>
    </div>
    <div class="progress-line"><span>Plan tamamlanma durumu</span><strong>%${stats.percent}</strong></div><div class="progress-track" style="margin-bottom:18px"><div class="progress-fill" style="width:${stats.percent}%"></div></div>
    <form id="plan-form" novalidate>
      <div class="week-plan-board">${DAYS.map((day, dayIndex) => {
        const items = state.plan.filter(item => item.day === day);
        const activeItems = items.filter(isPlanItemActive);
        const completedItems = activeItems.filter(item => item.done).length;
        const totalMinutes = activeItems.reduce((sum, item) => sum + (Number(item.duration) || 0), 0);
        return `<section class="plan-day-card day-${dayIndex + 1}" data-plan-day="${day}">
          <header class="plan-day-header"><div class="plan-day-identity"><span>${dayIcons[dayIndex]}</span><div><small>${dayIndex + 1}. GÜN</small><h3>${day}</h3></div></div><div class="plan-day-summary"><span>${activeItems.length} görev</span><span>${totalMinutes} dk.</span><strong>${completedItems}/${activeItems.length || 0} tamamlandı</strong></div></header>
          <div class="plan-task-list">${items.length ? items.map((item, itemIndex) => renderPlanTask(item, itemIndex)).join("") : `<div class="plan-day-empty"><span>☕</span><p>Bu gün için henüz görev yok. Dinlenebilir ya da yeni bir ders ekleyebilirsin.</p></div>`}</div>
          <button class="add-plan-task" type="button" data-action="add-plan-task" data-day="${day}"><span>＋</span> ${day} gününe ders ekle</button>
        </section>`;
      }).join("")}</div>
      <div id="plan-message" class="helper-message" role="alert" style="margin-top:14px"></div>
      <div class="plan-actions"><button class="button ghost" type="button" data-action="clear-plan">Planı Temizle</button><button class="button primary" type="submit">Haftalık Planı Kaydet ✓</button></div>
    </form>`;
}

function renderPlanTask(item, itemIndex) {
  return `<article class="plan-task-card ${item.done ? "done" : ""}" data-plan-task data-plan-id="${escapeHTML(item.id)}" data-day="${escapeHTML(item.day)}">
    <header class="plan-task-header"><div><span>${item.done ? "✓" : itemIndex + 1}</span><strong>${itemIndex + 1}. çalışma görevi</strong></div><label class="plan-done-toggle"><input type="checkbox" data-plan-field="done" aria-label="${escapeHTML(item.day)} ${itemIndex + 1}. görev tamamlandı" ${item.done ? "checked" : ""}><span>${item.done ? "Tamamlandı" : "Tamamla"}</span></label><button class="remove-plan-task" type="button" data-action="remove-plan-task" data-plan-id="${escapeHTML(item.id)}" aria-label="${escapeHTML(item.day)} ${itemIndex + 1}. görevi sil" title="Görevi sil">×</button></header>
    <div class="plan-task-fields">
      <label class="plan-field subject"><span>Çalışılacak ders</span><input data-plan-field="subject" value="${escapeHTML(item.subject)}" placeholder="Örnek: Türkçe" autocomplete="off"></label>
      <label class="plan-field topic"><span>Konu veya görev</span><input data-plan-field="topic" value="${escapeHTML(item.topic)}" placeholder="Örnek: 20 paragraf sorusu" autocomplete="off"></label>
      <label class="plan-field duration"><span>Çalışma</span><div class="input-suffix"><input data-plan-field="duration" type="number" min="5" max="300" inputmode="numeric" value="${escapeHTML(item.duration)}" placeholder="30"><b>dk.</b></div></label>
      <label class="plan-field break"><span>Sonraki mola</span><div class="input-suffix"><input data-plan-field="breakDuration" type="number" min="0" max="120" inputmode="numeric" value="${escapeHTML(item.breakDuration)}" placeholder="5"><b>dk.</b></div></label>
      <label class="plan-field note"><span>Kısa not</span><textarea data-plan-field="note" placeholder="Kaynak, sayfa veya kendine bir hatırlatma…">${escapeHTML(item.note)}</textarea></label>
    </div>
  </article>`;
}

function isPlanItemActive(item) {
  return Boolean(item.subject.trim() || item.topic.trim() || String(item.duration).trim() || item.note.trim() || item.done);
}

function readPlanForm(form = document.querySelector("#plan-form")) {
  if (!form) return state.plan;
  return Array.from(form.querySelectorAll("[data-plan-task]")).map(card => ({
    id: card.dataset.planId,
    day: card.dataset.day,
    subject: card.querySelector('[data-plan-field="subject"]').value.trim(),
    topic: card.querySelector('[data-plan-field="topic"]').value.trim(),
    duration: card.querySelector('[data-plan-field="duration"]').value.trim(),
    breakDuration: card.querySelector('[data-plan-field="breakDuration"]').value.trim(),
    done: card.querySelector('[data-plan-field="done"]').checked,
    note: card.querySelector('[data-plan-field="note"]').value.trim()
  }));
}

function addPlanTask(day) {
  state.plan = readPlanForm();
  const newItem = createPlanItem(day);
  state.plan.push(newItem);
  state.plan.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day));
  renderPlan();
  document.querySelector(`[data-plan-id="${newItem.id}"] [data-plan-field="subject"]`)?.focus();
}

function removePlanTask(planId) {
  state.plan = readPlanForm();
  const item = state.plan.find(planItem => planItem.id === planId);
  if (!item) return;
  if (isPlanItemActive(item) && !window.confirm(`${item.day} günündeki bu görevi silmek istediğine emin misin?`)) return;
  state.plan = state.plan.filter(planItem => planItem.id !== planId);
  saveCurrentPlanSnapshot();
  renderPlan();
  showToast("Görev plandan kaldırıldı.");
}

function savePlan(form) {
  const nextPlan = readPlanForm(form);
  const activeRows = nextPlan.filter(item => item.subject || item.topic || item.duration || item.note || item.done);
  const message = document.querySelector("#plan-message");
  if (!activeRows.length) {
    message.textContent = "Planını kaydetmek için en az bir güne ders, konu ve süre ekleyebilirsin.";
    message.classList.add("show");
    return;
  }
  const incompleteRow = activeRows.find(item => !item.subject || !item.topic || !item.duration);
  if (incompleteRow) {
    message.textContent = `${incompleteRow.day} günündeki görev için ders, konu ve çalışma süresini birlikte doldurabilir misin?`;
    message.classList.add("show");
    return;
  }
  const invalidDuration = activeRows.find(item => Number(item.duration) < 5 || Number(item.duration) > 300 || Number(item.breakDuration || 0) < 0 || Number(item.breakDuration || 0) > 120);
  if (invalidDuration) {
    message.textContent = `${invalidDuration.day} için çalışma süresi 5–300, mola süresi 0–120 dakika arasında olmalı.`;
    message.classList.add("show");
    return;
  }
  state.plan = activeRows;
  saveCurrentPlanSnapshot();
  showToast(`${activeRows.length} görevden oluşan haftalık planın kaydedildi. 🗓️`);
  renderPlan();
}

function getAutomaticSuggestion() {
  const completed = getCompletedIds().length;
  const plan = getPlanStats();
  if (completed <= 2) return "Bu hafta bir modül seçip küçük bir adımla başlayabilirsin.";
  if (plan.planned === 0 || plan.percent < 50) return "Planını daha küçük parçalara bölmeyi deneyebilirsin. Uygulayabileceğin tek bir gün seçmek bile iyi bir başlangıçtır.";
  if (completed >= 7) return "Düzenli ilerliyorsun, bu alışkanlığı korumaya çalış. Dinlenmeye de zaman ayırmayı unutma.";
  return "Güzel ilerliyorsun. Bu hafta bir modülü tamamlayıp planındaki küçük adımları sürdürmeyi deneyebilirsin.";
}

function getLastAnswerText() {
  const last = getLastAnsweredModule();
  if (!last?.module) return { title: "Henüz cevap yok", text: "İlk modül uygulamanı tamamladığında cevabın burada görünecek." };
  const lines = last.module.fields
    .filter(field => last.record.values[field[0]])
    .map(field => `${field[1]} ${last.record.values[field[0]]}`);
  return { title: `${last.module.id}. Modül: ${last.module.title}`, text: lines.join("\n") };
}

function buildReportText() {
  const activeModuleCount = getActiveModules().length;
  const name = state.settings.studentName.trim() || "Belirtilmedi";
  const completed = getCompletedIds();
  const plan = getPlanStats();
  const lastCompleted = getLastCompletedModule();
  const lastAnswer = getLastAnswerText();
  const completedNames = completed.length ? completed.map(id => `${id}. ${MODULES.find(item => item.id === id).title}`).join(", ") : "Henüz tamamlanan modül yok.";
  const workshopCompleted = getWorkshopCompletedIds();
  return `VERİMLİ DERS ÇALIŞMA AKADEMİSİ\nGELİŞİM RAPORU\n\nÖğrenci: ${name}\nTarih: ${new Intl.DateTimeFormat("tr-TR").format(new Date())}\nTamamlanan modül: ${completed.length} / ${activeModuleCount}\nÖzel ders atölyesi: ${workshopCompleted.length} / 10${state.workshop.startedAt ? ` • ${getWorkshopWeekNumber()}. haftada` : " • Henüz başlamadı"}\nTamamlanan haftalık görev: ${plan.completed} / ${plan.planned}\nHaftalık plan ilerlemesi: %${plan.percent}\nEn son yapılan uygulama: ${lastCompleted ? `${lastCompleted.id}. ${lastCompleted.title}` : "Henüz yok"}\n\nTamamlanan modüller:\n${completedNames}\n\nTamamlanan özel ders haftaları:\n${workshopCompleted.length ? workshopCompleted.map(id => `${id}. ${WORKSHOP_MODULES.find(module => module.id === id)?.title || ""}`).join(", ") : "Henüz yok"}\n\nSon cevap (${lastAnswer.title}):\n${lastAnswer.text}\n\nÖğrenciye öneri:\n${getAutomaticSuggestion()}`;
}

function renderReport() {
  const activeModuleCount = getActiveModules().length;
  const completed = getCompletedIds();
  const plan = getPlanStats();
  const lastCompleted = getLastCompletedModule();
  const lastAnswer = getLastAnswerText();
  const name = state.settings.studentName.trim() || "Öğrenci adı eklenmedi";
  const workshopCompleted = getWorkshopCompletedIds();
  main.innerHTML = `
    <section class="page-intro"><div><h2>Gelişimini görünür kıl</h2><p>Bu raporu kopyalayıp öğretmeninle paylaşabilirsin. Rapor yalnızca bu cihazdaki çalışmalarından oluşur.</p></div><div class="intro-icon" aria-hidden="true">📈</div></section>
    <article class="report-card">
      <header class="report-header"><p>VERİMLİ DERS ÇALIŞMA AKADEMİSİ</p><h2>${escapeHTML(name)} • Gelişim Raporu</h2></header>
      <div class="report-body">
        ${!state.settings.studentName.trim() ? `<div class="empty-state" style="margin-bottom:20px"><span>👤</span>Raporunda adının görünmesi için <button class="button secondary small" type="button" data-page="settings">Ayarlar'dan adını ekle</button></div>` : ""}
        <div class="report-stats"><div class="report-stat"><span>Tamamlanan modül</span><strong>${completed.length} / ${activeModuleCount}</strong></div><div class="report-stat"><span>Özel ders atölyesi</span><strong>${workshopCompleted.length} / 10</strong><small>${state.workshop.startedAt ? `${getWorkshopWeekNumber()}. program haftası` : "Henüz başlamadı"}</small></div><div class="report-stat"><span>Haftalık görev</span><strong>${plan.completed} / ${plan.planned}</strong></div><div class="report-stat"><span>Plan ilerlemesi</span><strong>%${plan.percent}</strong></div></div>
        <div class="report-row"><span>EN SON YAPILAN UYGULAMA</span><p>${lastCompleted ? `${lastCompleted.icon} ${lastCompleted.id}. ${lastCompleted.title} • ${formatDate(state.completed[lastCompleted.id].completedAt)}` : "Henüz bir modül tamamlanmadı."}</p></div>
        <div class="report-row"><span>ÖĞRENCİNİN SON CEVABI • ${escapeHTML(lastAnswer.title)}</span><p>${escapeHTML(lastAnswer.text)}</p></div>
        <div class="recommendation"><strong>💡 Sana özel küçük öneri</strong><p>${getAutomaticSuggestion()}</p></div>
        <div class="report-actions"><button class="button primary" type="button" data-action="copy-report">📋 Raporu Kopyala</button><button class="button secondary" type="button" data-action="share-whatsapp">WhatsApp ile Paylaş</button><button class="button ghost" type="button" data-action="share-email">E-posta ile Paylaş</button></div>
      </div>
    </article>`;
}

async function copyReport() {
  const text = buildReportText();
  try {
    await navigator.clipboard.writeText(text);
    showToast("Rapor kopyalandı. Şimdi öğretmenine gönderebilirsin! 📋");
  } catch (error) {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    showToast(copied ? "Rapor kopyalandı! 📋" : "Rapor kopyalanamadı. Tarayıcı izinlerini kontrol edebilirsin.", copied ? "success" : "error");
  }
}

function renderBadges() {
  const completed = getCompletedIds();
  const unlockedCount = BADGES.filter(badge => badge[3](completed)).length;
  main.innerHTML = `
    <section class="page-intro"><div><h2>Her adımın bir başarı</h2><p>Modülleri tamamladıkça yeni rozetlerin açılır. Kilitli rozetler seni bekliyor; acele etmene gerek yok.</p></div><div class="intro-icon" aria-hidden="true">🏅</div></section>
    <div class="progress-line"><span>Kazanılan rozet</span><strong>${unlockedCount} / ${BADGES.length}</strong></div><div class="progress-track" style="margin-bottom:26px"><div class="progress-fill" style="width:${Math.round(unlockedCount / BADGES.length * 100)}%"></div></div>
    <div class="badge-grid">${BADGES.map(badge => { const unlocked = badge[3](completed); return `<article class="badge-card ${unlocked ? "unlocked" : ""}"><span class="lock-mark">${unlocked ? "✓" : "🔒"}</span><div class="badge-medal">${badge[2]}</div><h3>${badge[0]}</h3><p>${unlocked ? "Rozet açıldı! Harika gidiyorsun." : badge[1]}</p></article>`; }).join("")}</div>`;
}

function renderTips() {
  const icons = ["⏰", "📵", "🧭", "🔁", "🪴", "📊", "🎯", "🔦"];
  const titles = ["Rutin oluştur", "Telefonuna mola ver", "Yanlışını incele", "Kısa tekrar yap", "Gerçekçi planla", "Sonucu yol haritası yap", "Küçük hedef seç", "Tek işe odaklan"];
  main.innerHTML = `
    <section class="page-intro"><div><h2>Öğretmeninden küçük hatırlatmalar</h2><p>Hepsini bir anda uygulamana gerek yok. Bugün sana en uygun gelen bir tavsiyeyi seçmen yeterli.</p></div><div class="intro-icon" aria-hidden="true">💡</div></section>
    <div class="tips-grid">${TEACHER_TIPS.map((tip, index) => `<article class="tip-card"><div class="tip-icon">${icons[index]}</div><div><h3>${titles[index]}</h3><p>${tip}</p></div></article>`).join("")}</div>`;
}

function renderSettings() {
  const theme = state.settings.theme || "blue";
  main.innerHTML = `
    <section class="page-intro"><div><h2>Akademini kendine göre ayarla</h2><p>Adını, günlük hedefini ve sevdiğin rengi seçebilirsin. Bu bilgiler yalnızca bu tarayıcıda saklanır.</p></div><div class="intro-icon" aria-hidden="true">⚙️</div></section>
    <div class="settings-layout">
      <form class="panel settings-form" id="settings-form">
        <div class="field-group"><label for="studentName">Öğrenci adı</label><input id="studentName" name="studentName" maxlength="50" value="${escapeHTML(state.settings.studentName)}" placeholder="Adını yaz"><small>Raporunda ve karşılama alanında görünür.</small></div>
        <div class="field-group"><label for="dailyGoal">Günlük çalışma hedefi (dakika)</label><input id="dailyGoal" name="dailyGoal" type="number" min="5" max="300" value="${escapeHTML(state.settings.dailyGoal)}" inputmode="numeric"><small>5 ile 300 dakika arasında sana uygun bir hedef seç.</small></div>
        <div class="field-group"><label>Renk teması</label><div class="theme-options">
          ${[["blue", "Mavi"], ["purple", "Mor"], ["green", "Yeşil"], ["orange", "Turuncu"]].map(item => `<button class="theme-option ${theme === item[0] ? "active" : ""}" type="button" data-action="select-theme" data-theme="${item[0]}" aria-pressed="${theme === item[0]}"><span class="theme-color ${item[0]}"></span><strong>${item[1]} tema</strong></button>`).join("")}
        </div></div>
        <input type="hidden" name="theme" value="${theme}"><button class="button primary" type="submit">Ayarları Kaydet ✓</button>
      </form>
      <section class="panel backup-zone"><div class="backup-zone-icon">💾</div><div class="backup-zone-copy"><span class="section-tag">VERİLERİMİ KORU</span><h3>Çalışmalarını yedekle</h3><p>Modül cevapların, okuma görevlerin ve haftalık planın tek bir dosyada saklanır. Yedek dosyanı güvenli bir yerde tut.</p><small>Yedek dosyası kişisel çalışma bilgilerini içerir. Tanımadığın kişilerle paylaşma.</small></div><div class="backup-actions"><button class="button backup-download" type="button" data-action="download-student-backup">↓ Yedeğimi İndir</button><label class="button backup-restore" for="student-backup-file">↺ Yedekten Geri Yükle</label><input id="student-backup-file" class="backup-file-input" type="file" accept="application/json,.json" data-backup-import="student"></div></section>
      <section class="panel danger-zone"><h3>🧹 Yeni bir başlangıç</h3><p>Tüm modül cevaplarını, tamamlanma bilgilerini, planını ve ayarlarını bu cihazdan silebilirsin. Bu işlem geri alınamaz.</p><button class="button danger" type="button" data-action="reset-data">Tüm Verileri Sıfırla</button></section>
    </div>`;
}

function saveSettings(form) {
  const dailyGoal = Number(form.elements.dailyGoal.value);
  if (!Number.isFinite(dailyGoal) || dailyGoal < 5 || dailyGoal > 300) {
    showToast("Günlük hedefini 5 ile 300 dakika arasında seçebilirsin.", "error");
    form.elements.dailyGoal.focus();
    return;
  }
  state.settings = { studentName: form.elements.studentName.value.trim(), dailyGoal, theme: form.elements.theme.value };
  saveData(STORAGE_KEYS.settings, state.settings);
  showToast("Ayarların kaydedildi! Akademi artık sana daha uygun. ✨");
  renderSettings();
  studentChipName.textContent = state.settings.studentName || "Öğrenci";
}

function applyTheme() {
  document.body.classList.remove("theme-purple", "theme-green", "theme-orange");
  if (state.settings.theme && state.settings.theme !== "blue") document.body.classList.add(`theme-${state.settings.theme}`);
  const colors = { blue: "#5267e8", purple: "#8b5edb", green: "#2fa77f", orange: "#e77b35" };
  document.querySelector('meta[name="theme-color"]').setAttribute("content", colors[state.settings.theme] || colors.blue);
}

function getStudentProgress(student) {
  const value = Array.isArray(student.student_progress) ? student.student_progress[0] : student.student_progress;
  return value || { payload: {}, completed_count: 0, plan_percent: 0, last_activity: null };
}

async function loadTeacherData() {
  teacherContent.innerHTML = `<div class="teacher-loading"><span class="button-spinner dark"></span><strong>Sınıf verileri hazırlanıyor…</strong></div>`;
  const [classesResult, studentsResult] = await Promise.all([
    cloudClient.from("classes").select("id,name,code_hint,active,created_at").eq("active", true).order("created_at"),
    cloudClient.from("students").select("id,class_id,name,code_hint,active,created_at,student_progress(payload,completed_count,plan_percent,last_activity,updated_at)").eq("active", true).order("name")
  ]);
  if (classesResult.error || studentsResult.error) {
    teacherContent.innerHTML = `<div class="teacher-error"><span>⚠️</span><h2>Veriler açılamadı</h2><p>Veri tabanı kurulumunun tamamlandığını kontrol edip yeniden deneyin.</p><button class="button primary" type="button" data-action="reload-teacher">Yeniden Dene</button></div>`;
    return;
  }
  teacherStore.classes = classesResult.data || [];
  teacherStore.students = studentsResult.data || [];
  if (!teacherStore.activeClassId || !teacherStore.classes.some(item => item.id === teacherStore.activeClassId)) {
    teacherStore.activeClassId = teacherStore.classes[0]?.id || null;
  }
  if (teacherPanelView === "modules") renderTeacherModuleManager();
  else if (teacherPanelView === "workshop") renderTeacherWorkshopTracking();
  else renderTeacherDashboard();
}

function addCalendarDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function getClassProgramWeeks(classRecord, students, referenceDate = new Date()) {
  const studentDates = students
    .map(student => new Date(student.created_at))
    .filter(date => !Number.isNaN(date.getTime()));
  const classDate = new Date(classRecord?.created_at);
  const anchor = studentDates.length
    ? new Date(Math.min(...studentDates.map(date => date.getTime())))
    : Number.isNaN(classDate.getTime()) ? referenceDate : classDate;
  const firstWeekStart = getReadingWeek(anchor).start;
  const currentWeekStart = getReadingWeek(referenceDate).start;
  const weekCount = Math.min(52, Math.max(1, Math.round((currentWeekStart - firstWeekStart) / (7 * 86400000)) + 1));
  return Array.from({ length: weekCount }, (_, index) => {
    const start = addCalendarDays(firstWeekStart, index * 7);
    const end = addCalendarDays(start, 6);
    return {
      weekNumber: index + 1,
      weekKey: localDateKey(start),
      start,
      end,
      isCurrent: localDateKey(start) === localDateKey(currentWeekStart),
      module: getActiveModules()[index] || null
    };
  });
}

function formatWeekRange(week) {
  const start = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(week.start).replace(".", "");
  const end = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(week.end).replace(".", "");
  return `${start} – ${end}`;
}

function getHistoricalPlan(student, week) {
  const progress = getStudentProgress(student);
  const payload = progress.payload || {};
  const archived = payload.planHistory?.[week.weekKey];
  if (Array.isArray(archived)) return { items: archived.filter(isPlanItemActive), source: "archive" };
  if (payload.planWeekKey === week.weekKey && Array.isArray(payload.plan)) {
    return { items: payload.plan.filter(isPlanItemActive), source: "current" };
  }
  const hasModernPlanData = Boolean(payload.planWeekKey || Object.keys(payload.planHistory || {}).length);
  if (!hasModernPlanData && Array.isArray(payload.plan)) {
    const currentWeek = getReadingWeek();
    const updatedAt = new Date(progress.updated_at || progress.last_activity || 0);
    const legacyWeekKey = updatedAt < currentWeek.start ? getPreviousWeekKey() : currentWeek.weekKey;
    if (week.weekKey === legacyWeekKey) return { items: payload.plan.filter(isPlanItemActive), source: "legacy" };
  }
  return { items: [], source: "unavailable" };
}

function getHistoricalStudentWeek(student, week, referenceDate = new Date()) {
  const progress = getStudentProgress(student);
  const payload = progress.payload || {};
  const tracking = getWeeklyTracking(payload, week.start);
  const todayKey = localDateKey(referenceDate);
  const elapsedDays = tracking.days.filter(day => day.key <= todayKey);
  const missedReadingDays = elapsedDays.filter(day => !day.reading);
  const lateReadingDays = elapsedDays.filter(day => day.reading && day.late);
  const missedLoginDays = elapsedDays.filter(day => !day.login);
  const plan = getHistoricalPlan(student, week);
  const completedPlanItems = plan.items.filter(item => item.done);
  const missedPlanItems = plan.items.filter(item => !item.done);
  const moduleRecord = week.module ? payload.completed?.[week.module.id] : null;
  const completedAt = moduleRecord?.completedAt ? new Date(moduleRecord.completedAt) : null;
  const weekEndExclusive = addCalendarDays(week.end, 1);
  let moduleStatus = "not-applicable";
  if (week.module) {
    if (completedAt && completedAt < weekEndExclusive) moduleStatus = "completed";
    else if (completedAt) moduleStatus = "late";
    else moduleStatus = week.isCurrent ? "pending" : "missed";
  }
  return {
    student,
    tracking,
    elapsedDays,
    missedReadingDays,
    lateReadingDays,
    missedLoginDays,
    plan,
    completedPlanItems,
    missedPlanItems,
    moduleStatus
  };
}

function formatDayList(days) {
  if (!days.length) return "Yok";
  return days.map(day => {
    const label = formatReadingDay(day.date);
    return `${label.weekday} ${label.date}`;
  }).join(", ");
}

function renderWeeklyHistoryPanel(classRecord, students) {
  const weeks = getClassProgramWeeks(classRecord, students);
  const defaultWeek = weeks.length > 1 ? weeks[weeks.length - 2] : weeks[0];
  if (!teacherStore.reportWeekKey || !weeks.some(week => week.weekKey === teacherStore.reportWeekKey)) {
    teacherStore.reportWeekKey = defaultWeek.weekKey;
  }
  const selectedWeek = weeks.find(week => week.weekKey === teacherStore.reportWeekKey) || defaultWeek;
  const summaries = students.map(student => getHistoricalStudentWeek(student, selectedWeek));
  const expectedReadingDays = summaries.reduce((sum, item) => sum + item.elapsedDays.length, 0);
  const completedReadings = summaries.reduce((sum, item) => sum + item.elapsedDays.filter(day => day.reading).length, 0);
  const moduleCompleted = summaries.filter(item => item.moduleStatus === "completed").length;
  const availablePlans = summaries.filter(item => item.plan.source !== "unavailable" && item.plan.items.length);
  const planPercent = availablePlans.length
    ? Math.round(availablePlans.reduce((sum, item) => sum + (item.completedPlanItems.length / item.plan.items.length) * 100, 0) / availablePlans.length)
    : null;

  return `<section class="teacher-history-panel">
    <div class="teacher-history-header"><div><span class="section-tag">HAFTA RAPORLARI</span><h2>Geçmiş haftalarda kim ne yaptı?</h2><p>Modül, günlük giriş, 5 paragraf ve çalışma planı kayıtlarını hafta hafta inceleyin.</p></div><button class="button secondary small" type="button" data-action="copy-weekly-class-report" data-week-key="${selectedWeek.weekKey}">📋 Bu Haftanın Raporunu Kopyala</button></div>
    <div class="history-week-tabs" role="tablist" aria-label="Rapor haftası">${weeks.map(week => `<button type="button" role="tab" aria-selected="${week.weekKey === selectedWeek.weekKey}" class="${week.weekKey === selectedWeek.weekKey ? "active" : ""}" data-action="select-report-week" data-week-key="${week.weekKey}"><strong>${week.weekNumber}. Hafta</strong><small>${formatWeekRange(week)}${week.isCurrent ? " • Güncel" : ""}</small></button>`).join("")}</div>
    <div class="history-summary">
      <div><span>Seçilen dönem</span><strong>${selectedWeek.weekNumber}. Hafta</strong><small>${formatWeekRange(selectedWeek)}</small></div>
      <div><span>Modülünü zamanında bitiren</span><strong>${moduleCompleted} / ${students.length}</strong><small>${selectedWeek.module ? escapeHTML(selectedWeek.module.title) : "Modül dönemi tamamlandı"}</small></div>
      <div><span>5 paragraf tamamlama</span><strong>${completedReadings} / ${expectedReadingDays}</strong><small>Kayıt açılmış günler</small></div>
      <div><span>Plan tamamlama ortalaması</span><strong>${planPercent === null ? "—" : `%${planPercent}`}</strong><small>${planPercent === null ? "Arşiv kaydı yok" : `${availablePlans.length} öğrenci`}</small></div>
    </div>
    ${students.length ? `<div class="history-student-list">${summaries.map(item => {
      const moduleLabels = {
        completed: ["✓ Zamanında tamamladı", "done"],
        late: ["↗ Sonradan tamamladı", "late"],
        pending: ["○ Bu hafta devam ediyor", "pending"],
        missed: ["⚠ Haftasında tamamlamadı", "missed"],
        "not-applicable": ["Modül görevi yok", "neutral"]
      };
      const moduleLabel = moduleLabels[item.moduleStatus];
      const readCount = item.elapsedDays.filter(day => day.reading).length;
      const loginCount = item.elapsedDays.filter(day => day.login).length;
      const planAvailable = item.plan.source !== "unavailable";
      return `<article class="history-student-card">
        <div class="history-student-name"><span>${escapeHTML(item.student.name.charAt(0).toLocaleUpperCase("tr-TR"))}</span><div><strong>${escapeHTML(item.student.name)}</strong><small>${loginCount}/${item.elapsedDays.length} gün giriş</small></div></div>
        <div class="history-report-cell"><small>${selectedWeek.module ? `${selectedWeek.weekNumber}. MODÜL` : "MODÜL"}</small><strong class="history-status ${moduleLabel[1]}">${moduleLabel[0]}</strong><p>${selectedWeek.module ? escapeHTML(selectedWeek.module.title) : "10 haftalık modül dönemi dışında"}</p></div>
        <div class="history-report-cell"><small>GİRİŞ VE 5 PARAGRAF</small><strong>${loginCount} giriş • ${readCount} okuma</strong><p>${item.missedReadingDays.length ? `Okuma eksik: ${escapeHTML(formatDayList(item.missedReadingDays))}` : "Okuma günü kaçırılmadı."}${item.lateReadingDays.length ? ` • Telafi: ${escapeHTML(formatDayList(item.lateReadingDays))}` : ""}${item.missedLoginDays.length ? ` • Giriş yok: ${escapeHTML(formatDayList(item.missedLoginDays))}` : ""}</p></div>
        <div class="history-report-cell"><small>HAFTALIK PLAN</small>${planAvailable ? `<strong>${item.completedPlanItems.length} / ${item.plan.items.length} görev</strong><p>${item.missedPlanItems.length ? `Tamamlanmayan: ${escapeHTML(item.missedPlanItems.map(planItem => `${planItem.day} • ${planItem.subject || planItem.topic}`).join(", "))}` : item.plan.items.length ? "Planlanan görevler tamamlandı." : "Bu hafta plan oluşturulmadı."}</p>` : `<strong>Arşiv kaydı yok</strong><p>Bu tarihte plan geçmişi henüz saklanmıyordu.</p>`}</div>
        <button class="history-inspect" type="button" data-action="view-student" data-student-id="${item.student.id}">İncele →</button>
      </article>`;
    }).join("")}</div>` : `<div class="empty-mini wide">Bu sınıfta raporlanacak öğrenci bulunmuyor.</div>`}
    <p class="history-archive-note">Giriş, okuma ve modül kayıtları mevcut tarihlerden alınır. Haftalık plan arşivi bu özellik yayınlandıktan sonra her Perşembe otomatik olarak yeni haftaya aktarılır.</p>
  </section>`;
}

function buildWeeklyClassReport(classId, weekKey) {
  const classRecord = teacherStore.classes.find(item => item.id === classId);
  if (!classRecord) return "";
  const students = teacherStore.students.filter(item => item.class_id === classId);
  const week = getClassProgramWeeks(classRecord, students).find(item => item.weekKey === weekKey);
  if (!week) return "";
  const lines = students.map(student => {
    const item = getHistoricalStudentWeek(student, week);
    const moduleText = {
      completed: "Zamanında tamamladı",
      late: "Sonradan tamamladı",
      pending: "Devam ediyor",
      missed: "Haftasında tamamlamadı",
      "not-applicable": "Modül görevi yok"
    }[item.moduleStatus];
    const readCount = item.elapsedDays.filter(day => day.reading).length;
    const loginCount = item.elapsedDays.filter(day => day.login).length;
    const planText = item.plan.source === "unavailable"
      ? "Arşiv kaydı yok"
      : `${item.completedPlanItems.length}/${item.plan.items.length} görev${item.missedPlanItems.length ? ` • Tamamlanmayan: ${item.missedPlanItems.map(planItem => `${planItem.day} ${planItem.subject || planItem.topic}`).join(", ")}` : ""}`;
    return `${student.name}\n- Modül: ${moduleText}\n- Giriş: ${loginCount}/${item.elapsedDays.length} gün${item.missedLoginDays.length ? ` • Eksik: ${formatDayList(item.missedLoginDays)}` : ""}\n- 5 paragraf: ${readCount}/${item.elapsedDays.length} gün${item.missedReadingDays.length ? ` • Eksik: ${formatDayList(item.missedReadingDays)}` : ""}${item.lateReadingDays.length ? ` • Telafi: ${formatDayList(item.lateReadingDays)}` : ""}\n- Plan: ${planText}`;
  });
  return `VERİMLİ DERS ÇALIŞMA AKADEMİSİ\nHAFTALIK SINIF RAPORU\n\nSınıf: ${classRecord.name}\nDönem: ${week.weekNumber}. Hafta • ${formatWeekRange(week)}\nModül: ${week.module ? `${week.module.id}. ${week.module.title}` : "Modül görevi yok"}\n\n${lines.join("\n\n")}`;
}

function getRemoteWorkshop(student) {
  return normalizeWorkshopState(getStudentProgress(student).payload?.workshop);
}

function renderTeacherWorkshopTracking() {
  const activeClass = teacherStore.classes.find(item => item.id === teacherStore.activeClassId) || null;
  const visibleStudents = activeClass ? teacherStore.students.filter(item => item.class_id === activeClass.id) : [];
  const started = visibleStudents.filter(student => getRemoteWorkshop(student).startedAt);
  const totalCompleted = started.reduce((sum, student) => sum + getWorkshopCompletedIds(getRemoteWorkshop(student)).length, 0);
  const average = started.length ? (totalCompleted / started.length).toFixed(1) : "0";
  const finished = started.filter(student => getWorkshopCompletedIds(getRemoteWorkshop(student)).length === WORKSHOP_MODULES.length).length;
  const activeThisWeek = started.filter(student => {
    const workshop = getRemoteWorkshop(student);
    const week = getWorkshopWeekNumber(workshop);
    return Boolean(workshop.completed[week] || workshop.answers[week]);
  }).length;

  teacherContent.innerHTML = `<section class="teacher-workshop-page"><div class="teacher-workshop-hero"><div><button class="button ghost small" type="button" data-action="back-teacher-dashboard">← Öğretmen paneli</button><span class="section-tag">SÜREKLİ ÖZEL DERS PROGRAMI</span><h1>Verimli Çalışma Atölyesi</h1><p>Her öğrencinin başlangıç tarihi, açık haftası, cevapları ve tamamlanma durumu birbirinden bağımsız ilerler.</p></div><div class="teacher-workshop-seal"><span>10</span><strong>HAFTA</strong><small>PDF DERS AKIŞI</small></div></div>
    <div class="teacher-stat-grid teacher-workshop-stats">${teacherStat("👥", "Seçili sınıf", visibleStudents.length, "Toplam öğrenci")}${teacherStat("🧭", "Atölyeye başlayan", started.length, "Kendi takvimi oluştu")}${teacherStat("📈", "Ortalama ilerleme", `${average} / 10`, "Tamamlanan hafta")}${teacherStat("🏆", "Programı bitiren", finished, `${activeThisWeek} öğrenci bu hafta aktif`)}</div>
    <section class="teacher-workshop-roster"><div class="teacher-workshop-roster-head"><div><span class="section-tag">SINIF SEÇİMİ</span><h2>${activeClass ? escapeHTML(activeClass.name) : "Bir sınıf seçin"}</h2><p>Öğrenciyi sınıfa eklemeniz yeterlidir. Öğrenci Atölye’yi ilk açtığında kendine özel 10 haftalık takvimi başlar.</p></div><div class="teacher-workshop-class-tabs">${teacherStore.classes.map(item => `<button class="${item.id === teacherStore.activeClassId ? "active" : ""}" type="button" data-action="select-teacher-class" data-class-id="${item.id}">${escapeHTML(item.name)}</button>`).join("")}</div></div>
      ${visibleStudents.length ? `<div class="teacher-workshop-student-list">${visibleStudents.map(student => {
        const workshop = getRemoteWorkshop(student);
        const completed = getWorkshopCompletedIds(workshop).length;
        const week = getWorkshopWeekNumber(workshop);
        const overdue = workshop.startedAt ? WORKSHOP_MODULES.filter(module => module.id < week && !workshop.completed[module.id]) : [];
        const startedAt = workshop.startedAt ? formatDate(workshop.startedAt) : "—";
        const last = workshop.lastActivity ? formatRelativeDate(workshop.lastActivity) : "Henüz çalışma yok";
        return `<article class="teacher-workshop-student ${workshop.startedAt ? "started" : "waiting"} ${overdue.length ? "has-overdue" : ""}"><span class="teacher-workshop-avatar">${escapeHTML(student.name.charAt(0).toLocaleUpperCase("tr-TR"))}</span><div class="teacher-workshop-student-name"><strong>${escapeHTML(student.name)}</strong><small>${workshop.startedAt ? `${startedAt} tarihinde başladı${overdue.length ? ` • ⚠ ${overdue.length} geçmiş hafta eksik` : ""}` : "Atölyeyi henüz başlatmadı"}</small></div><div class="teacher-workshop-week"><small>PROGRAM HAFTASI</small><strong>${workshop.startedAt ? `${week} / 10` : "—"}</strong></div><div class="teacher-workshop-meter"><span><i style="width:${completed * 10}%"></i></span><strong>${completed}/10 tamamlandı</strong><small>${last}</small></div><div class="teacher-workshop-dots">${WORKSHOP_MODULES.map(module => `<i class="${workshop.completed[module.id] ? "done" : module.id === week && workshop.startedAt ? "current" : module.id < week && workshop.startedAt ? "missed" : module.id > week || !workshop.startedAt ? "locked" : ""}" title="${module.id}. ${escapeHTML(module.title)}">${workshop.completed[module.id] ? "✓" : module.id}</i>`).join("")}</div><button class="button ghost small" type="button" data-action="view-student" data-student-id="${student.id}">Gelişim dosyası →</button></article>`;
      }).join("")}</div>` : `<div class="teacher-empty-class compact"><span>👋</span><h2>Bu sınıfta öğrenci yok</h2><p>Öğretmen ana panelinden yeni öğrenci ekleyebilirsiniz.</p></div>`}
    </section>
    <section class="teacher-workshop-curriculum"><div class="section-heading"><div><span class="section-tag">10 HAFTALIK DERS AKIŞI</span><h2>Program içerikleri</h2><p>Eklediğiniz PDF derslerinin ana kavramları ve uygulamaları ayrı bir rota olarak hazırlandı.</p></div></div><div class="teacher-workshop-curriculum-grid">${WORKSHOP_MODULES.map(module => `<article><span>${module.icon}</span><div><small>${module.id}. HAFTA</small><strong>${module.title}</strong><p>${module.short}</p></div></article>`).join("")}</div></section></section>`;
}

function renderTeacherDashboard() {
  const activeClass = teacherStore.classes.find(item => item.id === teacherStore.activeClassId) || null;
  const visibleStudents = activeClass ? teacherStore.students.filter(item => item.class_id === activeClass.id) : [];
  const allProgress = teacherStore.students.map(getStudentProgress);
  const todayKey = localDateKey();
  const loggedInToday = allProgress.filter(item => Boolean(item.payload?.attendance?.[todayKey])).length;
  const readToday = allProgress.filter(item => isReadingEntryCompleted(getReadingEntryForDate(item.payload || {}, todayKey))).length;
  const averageModules = allProgress.length ? (allProgress.reduce((sum, item) => sum + Number(item.completed_count || 0), 0) / allProgress.length).toFixed(1) : "0";
  const averagePlan = allProgress.length ? Math.round(allProgress.reduce((sum, item) => sum + Number(item.plan_percent || 0), 0) / allProgress.length) : 0;
  const workshopStudents = allProgress.filter(item => item.payload?.workshop?.startedAt);
  const averageWorkshop = workshopStudents.length ? (workshopStudents.reduce((sum, item) => sum + getWorkshopCompletedIds(item.payload.workshop).length, 0) / workshopStudents.length).toFixed(1) : "0";

  teacherContent.innerHTML = `
    <section class="teacher-welcome">
      <div><span class="section-tag">ÖĞRETMEN KONTROL MERKEZİ</span><h1>Öğrencilerinizin gelişimi<br>tek bir yerde.</h1><p>Modül ilerlemelerini, haftalık planlarını ve kendi cevaplarını güncel olarak inceleyin.</p></div>
      <div class="teacher-welcome-actions"><button class="button teacher-workshop-button" type="button" data-action="open-workshop-tracking">🧭 Özel Ders Atölyesi</button><button class="button teacher-module-button" type="button" data-action="open-module-manager">🧩 Modülleri Yönet</button>
      <div class="teacher-date"><span>BUGÜN</span><strong>${new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long" }).format(new Date())}</strong><small>${new Intl.DateTimeFormat("tr-TR", { weekday: "long" }).format(new Date())}</small></div>
      </div>
    </section>
    <div class="teacher-stat-grid">
      ${teacherStat("👥", "Toplam öğrenci", teacherStore.students.length, "Kayıtlı öğrenci")}
      ${teacherStat("📖", "Bugünkü takip", `${loggedInToday} / ${readToday}`, "Giriş / 5 paragraf")}
      ${teacherStat("📚", "Ortalama modül", `${averageModules} / ${getActiveModules().length}`, "Sınıf ortalaması")}
      ${teacherStat("🧭", "Özel ders atölyesi", `${averageWorkshop} / 10`, `${workshopStudents.length} öğrenci başladı`)}
      ${teacherStat("🗓️", "Plan ortalaması", `%${averagePlan}`, "Haftalık tamamlama")}
    </div>

    ${activeClass ? renderWeeklyHistoryPanel(activeClass, visibleStudents) : ""}

    <div class="teacher-dashboard-grid">
      <aside class="teacher-class-panel">
        <div class="teacher-panel-title"><div><span class="section-tag">SINIFLARIM</span><h2>Sınıflar</h2></div><span class="count-badge">${teacherStore.classes.length}</span></div>
        <div class="class-list">${teacherStore.classes.length ? teacherStore.classes.map(item => {
          const count = teacherStore.students.filter(student => student.class_id === item.id).length;
          return `<button class="class-list-item ${item.id === teacherStore.activeClassId ? "active" : ""}" type="button" data-action="select-teacher-class" data-class-id="${item.id}"><span>📘</span><div><strong>${escapeHTML(item.name)}</strong><small>${count} öğrenci • ${escapeHTML(item.code_hint)}</small></div><b>›</b></button>`;
        }).join("") : `<div class="empty-mini">Henüz sınıf oluşturmadınız.</div>`}</div>
        <form id="create-class-form" class="teacher-mini-form" novalidate><h3>＋ Yeni sınıf oluştur</h3><input name="className" maxlength="80" placeholder="Sınıf adı: 7/A Türkçe" aria-label="Sınıf adı"><input name="classCode" maxlength="20" placeholder="Sınıf kodu: TURKCE7A" aria-label="Sınıf kodu"><div class="login-message" data-form-message></div><button class="button primary small" type="submit">Sınıfı Oluştur</button></form>
      </aside>

      <section class="teacher-main-panel">
        ${activeClass ? `
          <div class="class-header"><div><span class="section-tag">AKTİF SINIF</span><h2>${escapeHTML(activeClass.name)}</h2><p>Öğrenciler giriş yaparken <strong>${escapeHTML(activeClass.code_hint)}</strong> sınıf kodunu kullanır.</p></div><div class="class-header-actions"><button class="button backup-class small" type="button" data-action="backup-class" data-class-id="${activeClass.id}">💾 Sınıfı Yedekle</button><button class="button secondary small" type="button" data-action="copy-class-code" data-code="${escapeHTML(activeClass.code_hint)}">📋 Sınıf Kodunu Kopyala</button></div></div>
          <div class="teacher-toolbar"><label class="search-box"><span>⌕</span><input id="student-search" placeholder="Öğrenci ara…" autocomplete="off"></label><button class="button primary small" type="button" data-action="toggle-add-student">＋ Öğrenci Ekle</button></div>
          <form id="add-student-form" class="add-student-form" hidden novalidate>
            <div><span class="section-tag">YENİ ÖĞRENCİ</span><h3>Öğrenci giriş bilgisi oluştur</h3></div>
            <div class="field-group"><label for="new-student-name">Öğrenci adı</label><input id="new-student-name" name="studentName" maxlength="80" placeholder="Ad Soyad"></div>
            <div class="field-group"><label for="new-student-code">Öğrenci kodu</label><div class="code-input"><input id="new-student-code" name="studentCode" maxlength="20" placeholder="En az 6 karakter"><button type="button" data-action="generate-student-code">Üret</button></div></div>
            <div class="login-message" data-form-message></div><button class="button primary" type="submit">Öğrenciyi Kaydet</button>
          </form>
          ${renderTeacherStudentTable(visibleStudents)}
        ` : `<div class="teacher-empty-class"><span>🏫</span><h2>İlk sınıfınızı oluşturun</h2><p>Soldaki kısa formu kullanın. Ardından öğrenci kodlarını oluşturarak sınıfınıza ekleyebilirsiniz.</p></div>`}
      </section>
    </div>`;
}

function teacherStat(icon, label, value, note) {
  return `<article class="teacher-stat"><span>${icon}</span><div><small>${label}</small><strong>${value}</strong><p>${note}</p></div></article>`;
}

function renderTeacherAlertCenter(studentAlerts, overdueModuleStudents, pendingReadingStudents) {
  const requiringAttention = studentAlerts.filter(item => item.alerts.hasAlert);
  if (!requiringAttention.length) {
    return `<section class="teacher-alert-center all-clear"><div class="teacher-alert-heading"><span>✓</span><div><small>GÜNLÜK TAKİP</small><h2>Bugün takip gerektiren bir durum yok</h2><p>Bu sınıftaki öğrencilerin süresi dolan modülü veya bekleyen günlük okuması bulunmuyor.</p></div></div></section>`;
  }
  return `<section class="teacher-alert-center">
    <div class="teacher-alert-heading"><span>!</span><div><small>TAKİP UYARILARI</small><h2>Hatırlatma bekleyen öğrenciler</h2><p>Haftası biten modüller ile günlük 5 paragraf görevleri burada görünür. Bugünkü görev, öğrenci tamamlayana kadar “bekleniyor” olarak kalır.</p></div><div class="teacher-alert-totals"><strong>${overdueModuleStudents}<small>modül uyarısı</small></strong><strong>${pendingReadingStudents}<small>bugünkü okuma</small></strong></div></div>
    <div class="teacher-alert-list">${requiringAttention.map(({ student, alerts }) => {
      const firstOverdue = alerts.overdueModules[0];
      return `<button class="teacher-alert-student" type="button" data-action="view-student" data-student-id="${student.id}">
        <span class="teacher-alert-avatar">${escapeHTML(student.name.charAt(0).toLocaleUpperCase("tr-TR"))}</span>
        <div><strong>${escapeHTML(student.name)}</strong><small>Ayrıntıları görmek için açın</small></div>
        <div class="teacher-alert-badges">
          ${firstOverdue ? `<em class="module-warning">⚠ ${firstOverdue.id}. modül${alerts.overdueModules.length > 1 ? ` +${alerts.overdueModules.length - 1}` : ""} gecikti</em>` : ""}
          ${alerts.missedReadingDays.length ? `<em class="reading-missed">📖 ${alerts.missedReadingDays.length} okuma günü eksik</em>` : ""}
          ${alerts.readingPendingToday ? `<em class="reading-pending">○ Bugünkü 5 paragraf bekleniyor</em>` : `<em class="reading-done">✓ Bugünkü okuma tamam</em>`}
        </div><b>İncele →</b>
      </button>`;
    }).join("")}</div>
    <p class="teacher-alert-note">Modül uyarıları, öğrencinin Akademiye katıldığı Perşembe–Çarşamba haftalarına göre hesaplanır.</p>
  </section>`;
}

function moduleFieldEditorValue(module) {
  return module.fields.map(field => [field[0], field[1], field[2], field[3], Array.isArray(field[4]) ? field[4].join(",") : ""].join(" | ")).join("\n");
}

function openTeacherModuleEditor(moduleId = "") {
  document.querySelector("#teacher-module-editor")?.remove();
  const module = moduleId ? getModuleById(moduleId) : null;
  const newModuleId = module?.id || (MODULES.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1);
  const draft = module ? { ...module, story: MODULE_ANECDOTES[module.id]?.paragraphs?.join("\n\n") || module.story } : normalizeManagedModule({ id: newModuleId, title: "", short: "", description: "", goal: "", story: "", task: "", fields: [["cevabim", "Bu beceriyle ilgili kendi düşüncem", "textarea", "Kısa bir cevap yaz."]], checks: ["Görevi tamamladım."] }, newModuleId - 1);
  teacherContent.insertAdjacentHTML("beforeend", `<div class="teacher-modal management-modal" id="teacher-module-editor"><div class="teacher-modal-backdrop" data-action="close-module-editor"></div><article class="management-dialog module-editor-dialog">
    <header class="management-header"><div><span class="section-tag">${module ? "MODÜLÜ DÜZENLE" : "YENİ MODÜL"}</span><h2>${module ? escapeHTML(module.title) : "Yeni çalışma becerisi"}</h2><p>Öğrencilerin okuyacağı anlatımı ve uygulama alanlarını bu ekrandan yönetin.</p></div><button class="modal-close" type="button" data-action="close-module-editor" aria-label="Kapat">×</button></header>
    <form id="teacher-module-form" class="module-management-form" data-module-id="${newModuleId}" novalidate>
      <div class="module-editor-grid"><div class="field-group"><label for="managed-module-title">Modül başlığı</label><input id="managed-module-title" name="title" maxlength="100" value="${escapeHTML(draft.title)}" placeholder="Örnek: Etkili soru çözme" required></div><div class="field-group"><label for="managed-module-icon">İkon</label><input id="managed-module-icon" name="icon" maxlength="4" value="${escapeHTML(draft.icon)}" placeholder="📘"></div></div>
      <div class="field-group"><label for="managed-module-short">Kısa açıklama</label><textarea id="managed-module-short" name="short" rows="2" maxlength="240" required>${escapeHTML(draft.short)}</textarea></div>
      <div class="field-group"><label for="managed-module-description">Neden önemli?</label><textarea id="managed-module-description" name="description" rows="4" required>${escapeHTML(draft.description)}</textarea></div>
      <div class="field-group"><label for="managed-module-goal">Öğrenme hedefi</label><textarea id="managed-module-goal" name="goal" rows="2" required>${escapeHTML(draft.goal)}</textarea></div>
      <div class="field-group"><label for="managed-module-story">Uzun günlük hayat anekdotu</label><textarea id="managed-module-story" name="story" rows="6" placeholder="Öğrencinin kendini içinde bulacağı bir hikâye yazın.">${escapeHTML(draft.story)}</textarea></div>
      <div class="field-group"><label for="managed-module-task">Küçük uygulama görevi</label><textarea id="managed-module-task" name="task" rows="3" required>${escapeHTML(draft.task)}</textarea></div>
      <div class="field-group"><label for="managed-module-fields">Cevap alanları</label><textarea id="managed-module-fields" name="fields" rows="7" placeholder="id | Soru metni | textarea | İpucu">${escapeHTML(moduleFieldEditorValue(draft))}</textarea><small>Her satır bir alan olsun. Biçim: <b>id | soru | text veya textarea | ipucu</b></small></div>
      <div class="field-group"><label for="managed-module-checks">Kontrol listesi</label><textarea id="managed-module-checks" name="checks" rows="5" placeholder="Görevi tamamladım.">${escapeHTML(draft.checks.join("\n"))}</textarea><small>Her satıra bir kontrol maddesi yazın.</small></div>
      <div class="login-message" data-form-message role="alert"></div><div class="form-actions"><button class="button ghost" type="button" data-action="close-module-editor">Vazgeç</button><button class="button primary" type="submit">${module ? "Değişiklikleri Kaydet" : "Modülü Ekle"} ✓</button></div>
    </form>
  </article></div>`);
  document.querySelector("#managed-module-title")?.focus();
}

function renderTeacherModuleManager() {
  const activeModules = getActiveModules();
  teacherContent.innerHTML = `<section class="teacher-management-page">
    <div class="teacher-management-hero"><div><button class="button ghost small" type="button" data-action="back-teacher-dashboard">← Öğretmen paneli</button><span class="section-tag">İÇERİK YÖNETİMİ</span><h1>Modül yönetim paneli</h1><p>Öğrencilerin göreceği çalışma becerilerini inceleyin, güncelleyin veya yeni bir modül ekleyin.</p></div><div class="teacher-management-actions"><button class="button secondary small" type="button" data-action="export-module-catalog">↓ Modül yedeği</button><button class="button primary" type="button" data-action="new-module">＋ Yeni modül ekle</button></div></div>
    <div class="module-manager-note"><span>💡</span><p>Değişiklikler bu tarayıcıda güvenle saklanır ve öğrenci önizlemesinde hemen görünür. Bir modülü kaldırmak, eski öğrenci cevaplarını silmez; yalnızca öğrenci listesinde pasifleştirir.</p></div>
    <div class="module-manager-summary"><div><strong>${activeModules.length}</strong><span>Aktif modül</span></div><div><strong>${MODULES.length - activeModules.length}</strong><span>Pasif modül</span></div><div><strong>${MODULES.reduce((sum, module) => sum + module.fields.length, 0)}</strong><span>Cevap alanı</span></div></div>
    <div class="module-manager-grid">${MODULES.map(module => `<article class="module-manager-card ${module.active === false ? "inactive" : ""}"><div class="module-manager-card-top"><span class="module-manager-icon">${escapeHTML(module.icon)}</span><span class="status-pill ${module.active === false ? "inactive" : "completed"}">${module.active === false ? "Pasif" : "Aktif"}</span></div><small>${module.id}. HAFTA</small><h2>${escapeHTML(module.title)}</h2><p>${escapeHTML(module.short)}</p><div class="module-manager-meta"><span>✏️ ${module.fields.length} cevap alanı</span><span>☑️ ${module.checks.length} kontrol</span></div><div class="module-manager-card-actions"><button class="button secondary small" type="button" data-action="inspect-module" data-module-id="${module.id}">İncele</button><button class="button ghost small" type="button" data-action="edit-module" data-module-id="${module.id}">Düzenle</button><button class="button ${module.active === false ? "primary" : "danger"} small" type="button" data-action="toggle-module" data-module-id="${module.id}">${module.active === false ? "Yayına al" : "Kaldır"}</button></div></article>`).join("")}</div>
  </section>`;
}

function inspectTeacherModule(moduleId) {
  const module = getModuleById(moduleId);
  if (!module) return;
  teacherContent.insertAdjacentHTML("beforeend", `<div class="teacher-modal management-modal" id="teacher-module-preview"><div class="teacher-modal-backdrop" data-action="close-module-preview"></div><article class="management-dialog module-preview-dialog"><header class="management-header"><div><span class="section-tag">MODÜL ÖNİZLEMESİ</span><h2>${escapeHTML(module.id)}. Hafta: ${escapeHTML(module.title)}</h2><p>Öğrencinin göreceği temel içerik.</p></div><button class="modal-close" type="button" data-action="close-module-preview">×</button></header><div class="module-preview-body"><div class="module-preview-lead"><span>${escapeHTML(module.icon)}</span><div><strong>${escapeHTML(module.short)}</strong><small>${module.fields.length} cevap alanı • ${module.checks.length} kontrol maddesi</small></div></div><section><h3>Neden önemli?</h3><p>${escapeHTML(module.description)}</p></section><section><h3>Öğrenme hedefi</h3><p>${escapeHTML(module.goal)}</p></section><section><h3>Günlük hayat anekdotu</h3><p>${escapeHTML(module.story)}</p></section><section><h3>Küçük uygulama</h3><p>${escapeHTML(module.task)}</p></section><section><h3>Cevap alanları</h3><ol>${module.fields.map(field => `<li>${escapeHTML(field[1])}</li>`).join("")}</ol></section><section><h3>Kontrol listesi</h3><ul>${module.checks.map(check => `<li>${escapeHTML(check)}</li>`).join("")}</ul></section></div><footer class="module-preview-footer"><button class="button ghost" type="button" data-action="close-module-preview">Kapat</button><button class="button primary" type="button" data-action="edit-module" data-module-id="${module.id}">Düzenle</button></footer></article></div>`);
}

function parseManagedModuleFields(raw) {
  return String(raw || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean).map((line, index) => {
    const parts = line.split("|").map(item => item.trim());
    const label = parts[1] || parts[0];
    const type = parts[2] === "textarea" || parts[2] === "select" ? parts[2] : "text";
    const options = type === "select" && parts[4] ? parts[4].split(",").map(item => item.trim()).filter(Boolean) : undefined;
    return [parts[0] || moduleFieldKey(label, index), label, type, parts[3] || "Kısa bir cevap yaz.", options].filter((value, valueIndex) => valueIndex < 4 || value !== undefined);
  });
}

function saveTeacherModule(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  const title = String(values.title || "").trim();
  const fields = parseManagedModuleFields(values.fields);
  const checks = String(values.checks || "").split(/\r?\n/).map(item => item.trim()).filter(Boolean);
  const message = form.querySelector("[data-form-message]");
  if (!title || !String(values.description || "").trim() || !String(values.goal || "").trim() || !String(values.task || "").trim() || !fields.length || !checks.length) {
    message.textContent = "Başlık, açıklama, hedef, görev, en az bir cevap alanı ve bir kontrol maddesi ekleyin.";
    message.className = "login-message show error";
    return;
  }
  const id = Number(form.dataset.moduleId);
  const existing = getModuleById(id);
  const updated = normalizeManagedModule({
    ...(existing || {}), id, icon: String(values.icon || "📘").trim() || "📘", title, short: String(values.short || "").trim(), description: String(values.description || "").trim(), goal: String(values.goal || "").trim(), story: String(values.story || values.description || "").trim(), task: String(values.task || "").trim(), fields, checks, active: existing ? existing.active !== false : true, updatedAt: new Date().toISOString()
  }, id - 1, existing || {});
  if (existing) MODULES.splice(MODULES.findIndex(item => item.id === id), 1, updated);
  else MODULES.push(updated);
  const storyParagraphs = updated.story.split(/\r?\n\s*\r?\n/).map(item => item.trim()).filter(Boolean);
  MODULE_ANECDOTES[id] = { title: "Bu becerinin günlük hayattaki karşılığı", paragraphs: storyParagraphs.length ? storyParagraphs : [updated.story], takeaway: updated.goal };
  ensureModuleRuntimeData(updated);
  saveManagedModuleCatalog();
  document.querySelector("#teacher-module-editor")?.remove();
  showToast(existing ? "Modül değişiklikleri kaydedildi. Öğrenci görünümü güncellendi. ✓" : "Yeni modül eklendi. Öğrenciler için yayına hazır. 🎉");
  renderTeacherModuleManager();
}

function toggleTeacherModule(moduleId) {
  const module = getModuleById(moduleId);
  if (!module) return;
  if (module.active !== false && getActiveModules().length <= 1) {
    showToast("En az bir aktif modül bulunmalı.", "error");
    return;
  }
  const nextActive = module.active === false;
  if (!nextActive && !window.confirm(`${module.title} pasifleştirilecek. Öğrenciler bu modülü artık yeni bir modül olarak görmeyecek. Devam etmek ister misiniz?`)) return;
  module.active = nextActive;
  module.updatedAt = new Date().toISOString();
  saveManagedModuleCatalog();
  showToast(nextActive ? "Modül yeniden yayına alındı. ✓" : "Modül pasifleştirildi. Eski öğrenci kayıtları korundu.");
  renderTeacherModuleManager();
}

function exportModuleCatalog() {
  const backup = { app: "Verimli Ders Çalışma Akademisi", backupType: "module-catalog", schemaVersion: 1, exportedAt: new Date().toISOString(), modules: MODULES };
  downloadJSONBackup(`vdca-moduller-${new Date().toISOString().slice(0, 10)}.json`, backup);
  showToast("Modül yedeği indirildi. 💾");
}

function renderTeacherStudentTable(students) {
  if (!students.length) return `<div class="teacher-empty-class compact"><span>👋</span><h2>Bu sınıf henüz boş</h2><p>“Öğrenci Ekle” düğmesiyle ilk öğrenci giriş kodunu oluşturabilirsiniz.</p></div>`;
  const todayKey = localDateKey();
  return `<div class="student-table-wrap"><table class="student-table"><thead><tr><th>Öğrenci</th><th>Giriş kodu</th><th>Modül ilerlemesi</th><th>Özel ders atölyesi</th><th>Plan</th><th>Bugün</th><th>Uyarı</th><th>Son çalışma</th><th></th></tr></thead><tbody>${students.map(student => {
    const progress = getStudentProgress(student);
    const loggedIn = Boolean(progress.payload?.attendance?.[todayKey]);
    const read = isReadingEntryCompleted(getReadingEntryForDate(progress.payload || {}, todayKey));
    const alerts = getTeacherStudentAlerts(student);
    const workshop = normalizeWorkshopState(progress.payload?.workshop);
    const workshopCompleted = getWorkshopCompletedIds(workshop).length;
    const workshopWeek = getWorkshopWeekNumber(workshop);
    return `<tr class="${alerts.hasAlert ? "has-warning" : ""}" data-student-row data-search-name="${escapeHTML(student.name.toLocaleLowerCase("tr-TR"))}"><td><div class="student-name-cell"><span>${escapeHTML(student.name.charAt(0).toLocaleUpperCase("tr-TR"))}</span><div><strong>${escapeHTML(student.name)}</strong><small>${progress.last_activity ? "Aktif öğrenci" : "Henüz başlamadı"}</small></div></div></td><td><button class="code-chip" type="button" data-action="copy-student-code" data-code="${escapeHTML(student.code_hint)}">${escapeHTML(student.code_hint)} 📋</button></td><td><div class="table-progress"><div><i style="width:${getActiveModules().length ? Math.round((Number(progress.completed_count || 0) / getActiveModules().length) * 100) : 0}%"></i></div><strong>${Number(progress.completed_count || 0)} / ${getActiveModules().length}</strong></div></td><td><div class="table-workshop-progress ${workshop.startedAt ? "started" : "waiting"}"><span>🧭</span><div><strong>${workshop.startedAt ? `${workshopCompleted}/10 • ${workshopWeek}. hafta` : "Başlamadı"}</strong><small>${workshop.startedAt ? `%${workshopCompleted * 10} tamamlandı` : "İlk açılışı bekliyor"}</small></div></div></td><td><span class="percent-chip ${Number(progress.plan_percent || 0) >= 70 ? "good" : ""}">%${Number(progress.plan_percent || 0)}</span></td><td><div class="daily-status-stack"><span class="${loggedIn ? "yes" : "no"}">${loggedIn ? "✓ Giriş" : "— Giriş"}</span><span class="${read ? "yes" : "no"}">${read ? "✓ Okuma" : "— Okuma"}</span></div></td><td><div class="student-warning-stack">${alerts.overdueModules.length ? `<span class="module-warning">⚠ ${alerts.overdueModules.length} modül</span>` : ""}${alerts.missedReadingDays.length ? `<span class="reading-missed">📖 ${alerts.missedReadingDays.length} gün eksik</span>` : ""}${alerts.readingPendingToday ? `<span class="reading-pending">○ Okuma bekleniyor</span>` : `<span class="all-done">✓ Güncel</span>`}</div></td><td><span class="last-seen">${progress.last_activity ? formatRelativeDate(progress.last_activity) : "—"}</span></td><td><div class="row-actions"><button class="preview-student-button" type="button" data-action="preview-student" data-student-id="${student.id}" title="Öğrenci panelini yeni sekmede aç"><span>👁️</span> Görünüm</button><button class="button ghost small" type="button" data-action="view-student" data-student-id="${student.id}">İncele →</button><button class="manage-student-button" type="button" data-action="manage-student" data-student-id="${student.id}" aria-label="${escapeHTML(student.name)} için düzenleme seçeneklerini aç" title="Öğrenciyi yönet">•••</button></div></td></tr>`;
  }).join("")}</tbody></table></div>`;
}

function formatRelativeDate(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "Şimdi";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} dk. önce`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} sa. önce`;
  if (diff < 7 * 86400000) return `${Math.floor(diff / 86400000)} gün önce`;
  return formatDate(iso);
}

function getStudentReportWeeks(student) {
  const classRecord = teacherStore.classes.find(item => item.id === student.class_id) || { created_at: student.created_at };
  return getClassProgramWeeks(classRecord, [student]).map(week => ({
    week,
    summary: getHistoricalStudentWeek(student, week)
  }));
}

function getStudentReportMetrics(student) {
  const progress = getStudentProgress(student);
  const payload = progress.payload || {};
  const weeks = getStudentReportWeeks(student);
  const readingEntries = weeks.flatMap(({ summary }) => summary.tracking.days.filter(day => day.reading).map(day => [day.key, day.readingEntry]));
  const lateReadings = readingEntries.filter(([key, entry]) => isLateReadingEntry(entry, key));
  const completedIds = Object.keys(payload.completed || {}).map(Number).filter(id => MODULES.some(module => module.id === id));
  const answeredCount = Object.values(payload.answers || {}).filter(record => Object.values(record?.values || {}).some(value => String(value || "").trim())).length;
  const activityCount = Object.values(payload.activities || {}).filter(record => Object.keys(record?.choices || {}).length > 0).length;
  const planTotals = weeks.reduce((totals, item) => {
    totals.planned += item.summary.plan.items.length;
    totals.done += item.summary.completedPlanItems.length;
    return totals;
  }, { planned: 0, done: 0 });
  const totalLogins = Object.keys(payload.attendance || {}).length;
  const totalParagraphs = readingEntries.reduce((sum, [, entry]) => sum + Number(entry?.paragraphs || 5), 0);
  const workshop = normalizeWorkshopState(payload.workshop);
  const workshopCompletedIds = getWorkshopCompletedIds(workshop);
  return {
    progress,
    payload,
    weeks,
    completedIds,
    answeredCount,
    activityCount,
    planTotals,
    totalLogins,
    readingCount: readingEntries.length,
    lateReadingCount: lateReadings.length,
    totalParagraphs,
    workshop,
    workshopCompletedIds,
    workshopWeek: getWorkshopWeekNumber(workshop)
  };
}

function studentReportModuleStatus(summary) {
  return {
    completed: "Tamamlandı",
    late: "Geç tamamlandı",
    missed: "Tamamlanmadı",
    pending: "Devam ediyor",
    "not-applicable": "Program dışı"
  }[summary.moduleStatus] || "Başlanmadı";
}

function openStudentPdfReport(studentId) {
  const student = teacherStore.students.find(item => item.id === studentId);
  if (!student) return;
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) {
    showToast("PDF raporu için yeni pencere iznini açabilirsin.", "error");
    return;
  }
  const metrics = getStudentReportMetrics(student);
  const { payload, weeks } = metrics;
  const expectedReadingDays = weeks.reduce((sum, item) => sum + item.summary.elapsedDays.length, 0);
  const expectedParagraphs = expectedReadingDays * 5;
  const requiredModules = weeks.filter(item => item.week.module).length;
  const reportDate = new Intl.DateTimeFormat("tr-TR", { dateStyle: "long" }).format(new Date());
  const moduleRows = weeks.filter(item => item.week.module).map(({ week, summary }) => {
    const module = week.module;
    const answer = payload.answers?.[module.id];
    const answerSaved = Boolean(answer && Object.values(answer.values || {}).some(value => String(value || "").trim()));
    const planText = summary.plan.items.length ? `${summary.completedPlanItems.length}/${summary.plan.items.length} görev` : "Plan yok";
    const paragraphText = `${summary.tracking.readingCount * 5} paragraf`;
    const lateText = summary.lateReadingDays.length ? ` • ${summary.lateReadingDays.length} telafi` : "";
    const missedText = summary.missedReadingDays.length ? ` • ${summary.missedReadingDays.length} eksik` : "";
    return `<tr><td><strong>${week.weekNumber}. Hafta</strong><small>${escapeHTML(formatWeekRange(week))}</small></td><td>${escapeHTML(module.title)}<small>${studentReportModuleStatus(summary)}</small></td><td>${paragraphText}<small>${summary.tracking.readingCount}/${summary.elapsedDays.length} gün${lateText}${missedText}</small></td><td>${summary.tracking.loginCount}/${summary.elapsedDays.length}<small>günlük giriş</small></td><td>${planText}<small>${answerSaved ? "Uygulama yanıtlandı" : "Uygulama yanıtı yok"}</small></td></tr>`;
  }).join("");
  const noRows = `<tr><td colspan="5" class="empty">Henüz haftalık kayıt oluşmadı.</td></tr>`;
  const lateDates = weeks.flatMap(({ summary }) => summary.lateReadingDays.map(day => `${formatDate(day.readingEntry?.completedAt)} (${formatDate(day.key)})`)).join(", ");
  const completedModules = metrics.completedIds.length ? metrics.completedIds.map(id => `${id}. ${MODULES.find(module => module.id === id)?.title || ""}`).join(" • ") : "Henüz tamamlanan modül yok.";
  const workshopRows = metrics.workshop.startedAt ? WORKSHOP_MODULES.map(module => {
    const completed = Boolean(metrics.workshop.completed[module.id]);
    const answered = Boolean(metrics.workshop.answers[module.id]);
    const locked = module.id > metrics.workshopWeek;
    const status = completed ? "Tamamlandı" : locked ? "Zamanı gelmedi" : answered ? "Devam ediyor" : "Başlanmadı";
    return `<tr><td><strong>${module.id}. Hafta</strong><small>${escapeHTML(formatWorkshopSchedule(module.id, metrics.workshop))}</small></td><td>${module.icon} ${escapeHTML(module.title)}</td><td>${status}</td><td>${answered ? `${Object.values(metrics.workshop.answers[module.id].values || {}).filter(value => String(value || "").trim()).length} cevap` : "—"}</td></tr>`;
  }).join("") : "";
  const answerSections = MODULES.map(module => {
    const answer = payload.answers?.[module.id];
    const answerItems = module.fields.filter(field => String(answer?.values?.[field[0]] || "").trim());
    const activity = payload.activities?.[module.id];
    const lab = ACTIVITY_LABS[module.id];
    const hasActivity = activity && (Object.keys(activity.choices || {}).length || String(activity.reflection || "").trim());
    if (!answerItems.length && !hasActivity) return "";
    const answersHtml = answerItems.map(field => `<div><small>${escapeHTML(field[1])}</small><p>${escapeHTML(answer.values[field[0]])}</p></div>`).join("");
    const activityHtml = hasActivity ? `<div class="activity-note"><strong>🎯 Etkileşimli atölye${lab ? ` • ${escapeHTML(lab.title)}` : ""}</strong><p>${escapeHTML(activity.reflection || "Seçimler yapıldı; yazılı düşünce notu eklenmedi.")}</p></div>` : "";
    return `<article class="answer-block"><h3>${module.icon} ${module.id}. ${escapeHTML(module.title)}</h3>${answer?.savedAt ? `<small class="saved-date">Kaydedilme: ${escapeHTML(formatDate(answer.savedAt))}</small>` : ""}<div class="answer-grid">${answersHtml}</div>${activityHtml}</article>`;
  }).filter(Boolean).join("");
  const workshopAnswerSections = WORKSHOP_MODULES.map(module => {
    const answer = metrics.workshop.answers[module.id];
    const answerItems = module.fields.filter(field => String(answer?.values?.[field[0]] || "").trim());
    if (!answerItems.length) return "";
    return `<article class="answer-block"><h3>${module.icon} Atölye ${module.id}. Hafta • ${escapeHTML(module.title)}</h3>${answer?.savedAt ? `<small class="saved-date">Kaydedilme: ${escapeHTML(formatDate(answer.savedAt))}</small>` : ""}<div class="answer-grid">${answerItems.map(field => `<div><small>${escapeHTML(field[1])}</small><p>${escapeHTML(answer.values[field[0]])}</p></div>`).join("")}</div></article>`;
  }).filter(Boolean).join("");
  const planSections = weeks.flatMap(({ week, summary }) => summary.plan.items.map(item => `<li><strong>${week.weekNumber}. Hafta • ${escapeHTML(item.day)}</strong> ${escapeHTML(item.subject || "Ders")} — ${escapeHTML(item.topic || "Konu belirtilmedi")} <em>${item.done ? "Tamamlandı" : "Bekliyor"}</em></li>`)).join("");
  reportWindow.document.open();
  reportWindow.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${escapeHTML(student.name)} • Akademi PDF Raporu</title><style>
    :root{color-scheme:light}*{box-sizing:border-box}body{margin:0;padding:32px;color:#1e2949;background:#f5f7fc;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5}.report{max-width:1050px;margin:0 auto;background:#fff;border:1px solid #dfe4f1;border-radius:22px;overflow:hidden;box-shadow:0 12px 35px rgba(36,44,80,.12)}.report-head{padding:30px 34px;color:#fff;background:linear-gradient(125deg,#3548b5,#6475ec)}.brand{font-size:11px;font-weight:800;letter-spacing:.14em;opacity:.85}.report-head h1{margin:8px 0 4px;font-size:29px}.report-head p{margin:0;opacity:.86}.body{padding:26px 34px}.meta{display:flex;justify-content:space-between;gap:16px;padding-bottom:18px;color:#66718b;border-bottom:1px solid #e6e9f2}.stats{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin:20px 0}.stat{padding:13px;border:1px solid #e5e8f2;border-radius:13px;background:#f8f9fd}.stat span{display:block;color:#69738b;font-size:10px}.stat strong{display:block;margin-top:3px;color:#1f2c53;font-size:20px}.section{margin-top:24px}.section h2{margin:0 0 10px;font-size:17px}.section p{margin:4px 0;color:#5d6882}.pill{display:inline-block;padding:5px 9px;border-radius:999px;color:#275b4b;background:#e3f6ee;font-weight:700}.late-list{padding:12px 14px;border-radius:12px;color:#93435b;background:#fff0f3}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #e7eaf2;text-align:left;vertical-align:top}th{color:#66718b;background:#f7f8fc;font-size:10px;letter-spacing:.04em}td strong,td small{display:block}td small{margin-top:2px;color:#74809a;font-size:10px}.empty{text-align:center;color:#7a849a;padding:20px}.footer{margin-top:28px;padding-top:14px;border-top:1px solid #e6e9f2;color:#7a849a;font-size:10px}.actions{display:flex;justify-content:flex-end;gap:8px;margin:0 auto 14px;max-width:1050px}.actions button{border:0;border-radius:10px;padding:10px 14px;color:#fff;background:#5267e8;font-weight:700;cursor:pointer}.actions button.secondary{color:#26335b;background:#e9edff}@media(max-width:800px){body{padding:12px}.body,.report-head{padding:22px 18px}.stats{grid-template-columns:repeat(2,1fr)}.meta{display:block}.meta span{display:block;margin-top:4px}.actions{justify-content:stretch}.actions button{flex:1}}@media print{body{padding:0;background:#fff;font-size:10px}.report{max-width:none;border:0;border-radius:0;box-shadow:none}.actions{display:none}.report-head{-webkit-print-color-adjust:exact;print-color-adjust:exact}.stat,.late-list,th{background:#f7f8fc;-webkit-print-color-adjust:exact;print-color-adjust:exact}table{page-break-inside:auto}tr{page-break-inside:avoid;page-break-after:auto}.section{break-inside:avoid}}
  </style></head><body><div class="actions"><button onclick="window.print()">PDF olarak kaydet / Yazdır</button><button class="secondary" onclick="window.close()">Kapat</button></div><main class="report"><header class="report-head"><div class="brand">VERİMLİ DERS ÇALIŞMA AKADEMİSİ</div><h1>${escapeHTML(student.name)} • Çalışma Raporu</h1><p>Bugüne kadar yapılan çalışmaların haftalık özeti</p></header><div class="body"><div class="meta"><span><strong>Sınıf:</strong> ${escapeHTML(teacherStore.classes.find(item => item.id === student.class_id)?.name || "—")}</span><span><strong>Rapor tarihi:</strong> ${escapeHTML(reportDate)}</span><span><strong>İlk kayıt:</strong> ${student.created_at ? escapeHTML(formatDate(student.created_at)) : "—"}</span></div><section class="stats"><div class="stat"><span>Tamamlanan modül</span><strong>${metrics.completedIds.length} / 10</strong></div><div class="stat"><span>Özel ders atölyesi</span><strong>${metrics.workshopCompletedIds.length} / 10</strong></div><div class="stat"><span>Okunan paragraf</span><strong>${metrics.totalParagraphs}</strong></div><div class="stat"><span>Okuma günü</span><strong>${metrics.readingCount}</strong></div><div class="stat"><span>Telafi okuması</span><strong>${metrics.lateReadingCount}</strong></div><div class="stat"><span>Günlük giriş</span><strong>${metrics.totalLogins}</strong></div><div class="stat"><span>Plan görevi</span><strong>${metrics.planTotals.done} / ${metrics.planTotals.planned}</strong></div></section><section class="section"><h2>Modül ve hafta dökümü</h2><p>Her hafta öğrencinin modül, giriş, paragraf okuma, telafi ve plan durumu birlikte gösterilir.</p><div class="table-wrap"><table><thead><tr><th>Hafta</th><th>Modül</th><th>Paragraf okuması</th><th>Giriş</th><th>Plan / uygulama</th></tr></thead><tbody>${moduleRows || noRows}</tbody></table></div></section>${workshopRows ? `<section class="section"><h2>Verimli Çalışma Atölyesi • Özel ders programı</h2><p>Öğrencinin kendi başlangıç tarihine göre ilerleyen ayrı 10 haftalık rota.</p><div class="table-wrap"><table><thead><tr><th>Hafta</th><th>Ders</th><th>Durum</th><th>Uygulama</th></tr></thead><tbody>${workshopRows}</tbody></table></div></section>` : ""}<section class="section"><h2>Tamamlanan modüller</h2><p class="pill">${escapeHTML(completedModules)}</p></section>${answerSections ? `<section class="section"><h2>Modül cevapları ve uygulamalar</h2>${answerSections}</section>` : ""}${workshopAnswerSections ? `<section class="section"><h2>Özel ders atölyesi cevapları</h2>${workshopAnswerSections}</section>` : ""}${planSections ? `<section class="section"><h2>Haftalık plan görevleri</h2><ul class="plan-list">${planSections}</ul></section>` : ""}${lateDates ? `<section class="section"><h2>Telafi edilen okumalar</h2><p class="late-list">${escapeHTML(lateDates)}<br><small>Parantez içindeki tarih, okumanın ait olduğu gündür.</small></p></section>` : ""}<section class="section"><h2>Genel not</h2><p>${metrics.completedIds.length >= 7 ? "Düzenli ilerliyor. Bu alışkanlığı korumaya devam edebilir." : metrics.readingCount >= 10 ? "Okuma alışkanlığı güçleniyor. Modül uygulamalarını da düzenli tamamlaması faydalı olur." : "Küçük ve düzenli adımlarla ilerlemesi desteklenebilir."}</p></section><div class="footer">Bu rapor Verimli Ders Çalışma Akademisi kayıtlarından otomatik olarak oluşturulmuştur.</div></div></main><script>setTimeout(function(){window.focus();window.print()},450)</script></body></html>`);
  reportWindow.document.close();
  const reportDoc = reportWindow.document;
  reportDoc.querySelector(".footer")?.remove();
  const reportSections = [...reportDoc.querySelectorAll(".section")];
  reportSections.find(section => section.querySelector("h2")?.textContent.trim() === "Genel not")?.remove();
  reportSections.find(section => section.querySelector("h2")?.textContent.trim() === "Tamamlanan modüller")?.remove();
  const paragraphPercent = expectedParagraphs ? Math.min(100, Math.round((metrics.totalParagraphs / expectedParagraphs) * 100)) : 0;
  const modulePercent = requiredModules ? Math.min(100, Math.round((metrics.completedIds.length / requiredModules) * 100)) : 0;
  const workshopRequired = metrics.workshop.startedAt ? metrics.workshopWeek : 0;
  const workshopPercent = workshopRequired ? Math.min(100, Math.round((metrics.workshopCompletedIds.length / workshopRequired) * 100)) : 0;
  const visualSummary = [
    '<section class="visual-summary"><div class="visual-summary-heading"><div><span>VELİ İÇİN KISA ÖZET</span><h2>Çalışma durumu bir bakışta</h2></div><small>', escapeHTML(reportDate), '</small></div>',
    '<div class="visual-chart-grid"><article class="visual-chart"><div class="visual-chart-title"><strong>📖 Paragraf okuması</strong><b>', metrics.totalParagraphs, ' / ', expectedParagraphs, '</b></div><div class="visual-track"><i class="target" style="width:100%"></i><i class="actual" style="width:', paragraphPercent, '%"></i></div><div class="visual-legend"><span><i class="dot target-dot"></i>Okunması gereken: ', expectedParagraphs, '</span><span><i class="dot actual-dot"></i>Okunan: ', metrics.totalParagraphs, '</span></div></article>',
    '<article class="visual-chart"><div class="visual-chart-title"><strong>🎯 Modül ilerlemesi</strong><b>', metrics.completedIds.length, ' / ', requiredModules, '</b></div><div class="visual-track"><i class="target" style="width:100%"></i><i class="actual module-actual" style="width:', modulePercent, '%"></i></div><div class="visual-legend"><span><i class="dot target-dot"></i>Yapılması gereken: ', requiredModules, '</span><span><i class="dot actual-dot"></i>Yapılan: ', metrics.completedIds.length, '</span></div></article>',
    '<article class="visual-chart"><div class="visual-chart-title"><strong>🧭 Özel ders atölyesi</strong><b>', metrics.workshopCompletedIds.length, ' / ', workshopRequired, '</b></div><div class="visual-track"><i class="target" style="width:100%"></i><i class="actual workshop-actual" style="width:', workshopPercent, '%"></i></div><div class="visual-legend"><span><i class="dot target-dot"></i>Açılan hafta: ', workshopRequired, '</span><span><i class="dot workshop-dot"></i>Tamamlanan: ', metrics.workshopCompletedIds.length, '</span></div></article></div></section>'
  ].join("");
  reportDoc.querySelector(".stats")?.insertAdjacentHTML("afterend", visualSummary);
  const printStyle = reportDoc.createElement("style");
  printStyle.textContent = ".visual-summary{margin:18px 0 22px;padding:18px;border:1px solid #dfe4f1;border-radius:16px;background:#f8f9ff}.visual-summary-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.visual-summary-heading span{color:#5267e8;font-size:9px;font-weight:800;letter-spacing:.12em}.visual-summary-heading h2{margin:3px 0 0;font-size:18px}.visual-summary-heading small{color:#74809a;font-size:10px}.visual-chart-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:15px}.visual-chart{padding:13px;border:1px solid #e4e8f4;border-radius:12px;background:#fff}.visual-chart-title{display:flex;align-items:center;justify-content:space-between;gap:8px}.visual-chart-title strong{font-size:12px}.visual-chart-title b{color:#3548b5;font-size:15px}.visual-track{position:relative;height:14px;margin:14px 0 10px;overflow:hidden;border-radius:999px;background:#edf0f7}.visual-track i{position:absolute;top:0;bottom:0;left:0;display:block;border-radius:999px}.visual-track .target{background:#dce1f2}.visual-track .actual{z-index:1;background:linear-gradient(90deg,#5267e8,#7d8cff)}.visual-track .module-actual{background:linear-gradient(90deg,#2fa77f,#64c79f)}.visual-track .workshop-actual{background:linear-gradient(90deg,#ef8d27,#f3b34f)}.visual-legend{display:grid;gap:4px;color:#69738b;font-size:9px}.visual-legend span{display:flex;align-items:center;gap:5px}.dot{display:inline-block;width:8px;height:8px;border-radius:50%}.target-dot{background:#c5cce0}.actual-dot{background:#5267e8}.visual-chart:nth-child(2) .actual-dot{background:#2fa77f}.workshop-dot{background:#ef8d27}@media(max-width:800px){.visual-chart-grid{grid-template-columns:1fr}}@media print{.visual-summary{break-inside:avoid;margin:12px 0 15px;padding:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact}.visual-chart-grid{gap:10px}.section{break-inside:auto;margin-top:14px}.section h2{break-after:avoid}.answer-block{break-inside:avoid;margin-top:6px;padding:9px}.answer-grid{grid-template-columns:repeat(3,1fr);gap:5px}.answer-grid>div{padding:6px}.plan-list{columns:2;margin-top:5px}.footer{margin-top:14px}}";
  reportDoc.head.append(printStyle);
  reportWindow.focus();
}

function renderTeacherStudentDetail(studentId) {
  const student = teacherStore.students.find(item => item.id === studentId);
  if (!student) return;
  teacherStore.selectedStudentId = studentId;
  const progress = getStudentProgress(student);
  const payload = progress.payload || {};
  const completedIds = Object.keys(payload.completed || {}).map(Number);
  const activityCount = Object.values(payload.activities || {}).filter(record => Object.keys(record.choices || {}).length > 0).length;
  const weeklyTracking = getWeeklyTracking(payload);
  const readingCount = weeklyTracking.readingCount;
  const answeredModules = Object.entries(payload.answers || {}).sort((a, b) => new Date(b[1]?.savedAt || 0) - new Date(a[1]?.savedAt || 0));
  const activityEntries = Object.entries(payload.activities || {}).filter(([, record]) => Object.keys(record.choices || {}).length > 0);
  const plan = Array.isArray(payload.plan) ? payload.plan : [];
  const plannedItems = plan.filter(item => item.subject || item.topic || item.duration);
  const workshop = normalizeWorkshopState(payload.workshop);
  const workshopCompletedIds = getWorkshopCompletedIds(workshop);
  const workshopWeek = getWorkshopWeekNumber(workshop);
  const workshopAnswers = Object.entries(workshop.answers || {}).sort((a, b) => new Date(b[1]?.savedAt || 0) - new Date(a[1]?.savedAt || 0));

  teacherContent.insertAdjacentHTML("beforeend", `<div class="teacher-modal" id="teacher-student-modal"><div class="teacher-modal-backdrop" data-action="close-student-detail"></div><article class="student-detail-sheet">
    <header class="student-detail-header"><div class="student-detail-identity"><span>${escapeHTML(student.name.charAt(0).toLocaleUpperCase("tr-TR"))}</span><div><small>ÖĞRENCİ GELİŞİM DOSYASI</small><h2>${escapeHTML(student.name)}</h2><p>Son güncelleme: ${progress.last_activity ? formatDate(progress.last_activity) : "Henüz çalışma yok"}</p></div></div><button class="modal-close" type="button" data-action="close-student-detail" aria-label="Kapat">×</button></header>
    <div class="student-detail-body">
      <div class="student-detail-stats"><div><span>Tamamlanan modül</span><strong>${completedIds.length} / 10</strong></div><div><span>Özel ders atölyesi</span><strong>${workshopCompletedIds.length} / 10</strong></div><div><span>Haftalık plan</span><strong>%${Number(progress.plan_percent || 0)}</strong></div><div><span>Yanıtlanan uygulama</span><strong>${answeredModules.length + workshopAnswers.length}</strong></div><div><span>Haftalık giriş</span><strong>${weeklyTracking.loginCount} / 7</strong></div><div><span>Haftalık okuma</span><strong>${readingCount} / 7</strong></div></div>
      <section class="detail-section teacher-reading-section"><div class="detail-title"><div><span class="section-tag">PERŞEMBE – ÇARŞAMBA</span><h3>Günlük giriş ve 5 paragraf takibi</h3></div><strong>${weeklyTracking.loginCount}/7 giriş • ${readingCount}/7 okuma</strong></div><div class="teacher-week-grid">${weeklyTracking.days.map(day => {
        const labels = formatReadingDay(day.date);
        const isToday = day.key === weeklyTracking.todayKey;
        const isFuture = day.key > weeklyTracking.todayKey;
        return `<article class="teacher-day-card ${isToday ? "today" : ""} ${day.reading ? (day.late ? "late" : "done") : ""}"><div class="teacher-day-heading"><span>${escapeHTML(labels.weekday)}</span><strong>${escapeHTML(labels.date)}</strong>${isToday ? "<small>BUGÜN</small>" : ""}</div><div class="teacher-day-signals"><span class="${day.login ? "yes" : isFuture ? "waiting" : "no"}">${day.login ? "✓ Giriş yaptı" : isFuture ? "• Bekleniyor" : "— Giriş yapmadı"}</span><span class="${day.reading ? (day.late ? "late" : "yes") : isFuture ? "waiting" : "no"}">${day.reading ? (day.late ? `↺ 5 paragraf telafi edildi${day.readingEntry?.completedAt ? ` (${formatDate(day.readingEntry.completedAt)})` : ""}` : "✓ 5 paragraf okudu") : isFuture ? "• Okuma bekleniyor" : "— Okuma yapmadı"}</span></div></article>`;
      }).join("")}</div></section>
      <section class="detail-section"><div class="detail-title"><div><span class="section-tag">MODÜLLER</span><h3>Beceri gelişimi</h3></div></div><div class="detail-module-grid">${MODULES.map(module => `<div class="detail-module ${completedIds.includes(module.id) ? "done" : answeredModules.some(([id]) => Number(id) === module.id) ? "progress" : ""}"><span>${completedIds.includes(module.id) ? "✓" : module.icon}</span><div><small>${module.id}. Hafta</small><strong>${module.title}</strong></div></div>`).join("")}</div></section>
      <section class="detail-section teacher-workshop-detail"><div class="detail-title"><div><span class="section-tag">VERİMLİ ÇALIŞMA ATÖLYESİ</span><h3>Özel ders programı</h3><p>${workshop.startedAt ? `${formatDate(workshop.startedAt)} tarihinde başladı • Şu anda ${workshopWeek}. program haftası` : "Öğrenci bu ayrı programa henüz başlamadı."}</p></div><strong>${workshopCompletedIds.length}/10 hafta</strong></div><div class="detail-workshop-route">${WORKSHOP_MODULES.map(module => `<div class="detail-workshop-week ${workshop.completed[module.id] ? "done" : workshop.startedAt && module.id === workshopWeek ? "current" : !workshop.startedAt || module.id > workshopWeek ? "locked" : workshop.answers[module.id] ? "progress" : ""}"><span>${workshop.completed[module.id] ? "✓" : module.icon}</span><div><small>${module.id}. HAFTA${workshop.startedAt ? ` • ${formatWorkshopSchedule(module.id, workshop)}` : ""}</small><strong>${module.title}</strong>${workshop.answers[module.id] ? `<p>${Object.values(workshop.answers[module.id].values || {}).filter(value => String(value || "").trim()).length} cevap kaydedildi</p>` : ""}</div></div>`).join("")}</div>${workshopAnswers.length ? `<div class="answer-accordion workshop-answer-accordion">${workshopAnswers.map(([id, record]) => {
        const module = WORKSHOP_MODULES.find(item => item.id === Number(id));
        if (!module) return "";
        const answers = module.fields.filter(field => record.values?.[field[0]]).map(field => `<div><small>${field[1]}</small><p>${escapeHTML(record.values[field[0]])}</p></div>`).join("");
        return `<details><summary><span>${module.icon}</span><div><small>ATÖLYE • ${module.id}. HAFTA</small><strong>${module.title}</strong></div><b>＋</b></summary><div class="answer-detail">${answers}</div></details>`;
      }).join("")}</div>` : ""}</section>
      <section class="detail-section"><div class="detail-title"><div><span class="section-tag">ETKİLEŞİMLİ ATÖLYELER</span><h3>Karar, güven ve görev takibi</h3></div></div>${activityEntries.length ? `<div class="teacher-activity-list">${activityEntries.map(([id, record]) => {
        const lab = ACTIVITY_LABS[id];
        if (!lab) return "";
        const answered = Object.keys(record.choices || {}).length;
        const correct = lab.items.filter((item, index) => record.choices?.[index] === item[1]).length;
        return `<article class="teacher-activity-item"><span>${lab.icon}</span><div><small>${id}. MODÜL ATÖLYESİ</small><strong>${lab.title}</strong><p>${escapeHTML(record.reflection || "Öğrenci henüz düşünce notu yazmadı.")}</p></div><div class="teacher-activity-metrics"><b>${correct}/${answered || lab.items.length}</b><small>${(record.missionDays || []).filter(Boolean).length}/7 görev</small><em>${record.confidenceBefore || "–"} → ${record.confidenceAfter || "–"} güven</em></div></article>`;
      }).join("")}</div>` : `<div class="empty-mini wide">Öğrenci henüz etkileşimli atölyeye başlamadı.</div>`}</section>
      <section class="detail-section"><div class="detail-title"><div><span class="section-tag">ÖĞRENCİ CEVAPLARI</span><h3>Son uygulamalar</h3></div></div>${answeredModules.length ? `<div class="answer-accordion">${answeredModules.map(([id, record]) => {
        const module = MODULES.find(item => item.id === Number(id));
        if (!module) return "";
        const answers = module.fields.filter(field => record.values?.[field[0]]).map(field => `<div><small>${field[1]}</small><p>${escapeHTML(record.values[field[0]])}</p></div>`).join("");
        return `<details><summary><span>${module.icon}</span><div><small>${module.id}. MODÜL</small><strong>${module.title}</strong></div><b>＋</b></summary><div class="answer-detail">${answers}</div></details>`;
      }).join("")}</div>` : `<div class="empty-mini wide">Öğrenci henüz bir uygulama cevabı kaydetmedi.</div>`}</section>
      <section class="detail-section"><div class="detail-title"><div><span class="section-tag">HAFTALIK PLAN</span><h3>Planlanan çalışmalar</h3></div></div>${plannedItems.length ? `<div class="detail-plan-list">${plannedItems.map(item => `<div class="detail-plan-item ${item.done ? "done" : ""}"><span>${item.done ? "✓" : item.day.slice(0, 2)}</span><div><strong>${escapeHTML(item.subject)} • ${escapeHTML(item.topic)}</strong><small>${escapeHTML(item.day)} • ${escapeHTML(item.duration)} dakika çalışma${Number(item.breakDuration) ? ` • ${escapeHTML(item.breakDuration)} dakika mola` : ""}${item.note ? ` • ${escapeHTML(item.note)}` : ""}</small></div></div>`).join("")}</div>` : `<div class="empty-mini wide">Öğrenci henüz haftalık plan oluşturmadı.</div>`}</section>
    </div>
    <footer class="student-detail-footer"><button class="button ghost" type="button" data-action="close-student-detail">Kapat</button><button class="button student-backup-button" type="button" data-action="backup-remote-student" data-student-id="${student.id}">💾 Öğrenciyi Yedekle</button><button class="button preview-launch" type="button" data-action="preview-student" data-student-id="${student.id}">👁️ Öğrenci Panelini Aç</button><button class="button secondary" type="button" data-action="manage-student" data-student-id="${student.id}">✏️ Öğrenciyi Düzenle</button><button class="button primary" type="button" data-action="print-student-report" data-student-id="${student.id}">📄 PDF Raporu</button><button class="button primary" type="button" data-action="copy-remote-report" data-student-id="${student.id}">📋 Öğrenci Raporunu Kopyala</button></footer>
  </article></div>`);
}

function renderStudentManagementModal(studentId) {
  document.querySelector("#teacher-student-modal")?.remove();
  document.querySelector("#student-management-modal")?.remove();
  const student = teacherStore.students.find(item => item.id === studentId);
  if (!student) return;
  const progress = getStudentProgress(student);
  teacherContent.insertAdjacentHTML("beforeend", `<div class="teacher-modal management-modal" id="student-management-modal"><div class="teacher-modal-backdrop" data-action="close-student-management"></div><article class="management-dialog">
    <header class="management-header"><div><span class="section-tag">ÖĞRENCİ YÖNETİMİ</span><h2>${escapeHTML(student.name)}</h2><p>Öğrencinin giriş bilgilerini ve çalışmalarını yönetin.</p></div><button class="modal-close" type="button" data-action="close-student-management" aria-label="Kapat">×</button></header>
    <form id="edit-student-form" class="management-form" data-student-id="${student.id}" novalidate>
      <div class="management-avatar">${escapeHTML(student.name.charAt(0).toLocaleUpperCase("tr-TR"))}</div>
      <div class="field-group"><label for="edit-student-name">Öğrenci adı</label><input id="edit-student-name" name="studentName" maxlength="80" value="${escapeHTML(student.name)}" required><small>Öğretmen panelinde ve öğrenci girişinde bu ad görünür.</small></div>
      <div class="field-group"><label for="edit-student-code">Öğrenci giriş kodu</label><div class="code-input"><input id="edit-student-code" name="studentCode" maxlength="20" value="${escapeHTML(student.code_hint)}" required><button type="button" data-action="generate-edit-student-code">Yenile</button></div><small>Kodu değiştirirseniz eski kod hemen geçersiz olur.</small></div>
      <div class="login-message" data-form-message role="alert"></div>
      <button class="button primary" type="submit">Değişiklikleri Kaydet ✓</button>
    </form>
    <section class="management-danger-zone"><div><span>↺</span><div><strong>Çalışma ilerlemesini sıfırla</strong><p>${Number(progress.completed_count || 0)} modül ve haftalık plan bilgileri temizlenir. Öğrenci hesabı kalır.</p></div></div><button class="button ghost small" type="button" data-action="reset-student-progress" data-student-id="${student.id}">İlerlemeyi Sıfırla</button></section>
    <section class="management-danger-zone delete"><div><span>🗑️</span><div><strong>Öğrenciyi sınıftan sil</strong><p>Öğrenci ve tüm çalışma verileri kalıcı olarak silinir. Bu işlem geri alınamaz.</p></div></div><button class="button danger small" type="button" data-action="delete-student" data-student-id="${student.id}">Öğrenciyi Sil</button></section>
  </article></div>`);
}

function buildRemoteStudentReport(student) {
  const progress = getStudentProgress(student);
  const payload = progress.payload || {};
  const completedIds = Object.keys(payload.completed || {}).map(Number);
  const activityCount = Object.values(payload.activities || {}).filter(record => Object.keys(record.choices || {}).length > 0).length;
  const weeklyTracking = getWeeklyTracking(payload);
  const readingCount = weeklyTracking.readingCount;
  const answers = Object.entries(payload.answers || {}).sort((a, b) => new Date(b[1]?.savedAt || 0) - new Date(a[1]?.savedAt || 0));
  const workshop = normalizeWorkshopState(payload.workshop);
  const workshopCompleted = getWorkshopCompletedIds(workshop);
  const lastAnswer = answers[0];
  let lastAnswerText = "Henüz uygulama cevabı yok.";
  if (lastAnswer) {
    const module = MODULES.find(item => item.id === Number(lastAnswer[0]));
    lastAnswerText = `${module?.title || "Modül"}\n${module?.fields.filter(field => lastAnswer[1].values?.[field[0]]).map(field => `${field[1]} ${lastAnswer[1].values[field[0]]}`).join("\n") || ""}`;
  }
  return `VERİMLİ DERS ÇALIŞMA AKADEMİSİ\nÖĞRETMEN GELİŞİM RAPORU\n\nÖğrenci: ${student.name}\nTarih: ${new Intl.DateTimeFormat("tr-TR").format(new Date())}\nTamamlanan modül: ${completedIds.length} / ${getActiveModules().length}\nEtkileşimli atölye: ${activityCount} / ${getActiveModules().length}\nÖzel ders programı: ${workshopCompleted.length} / 10${workshop.startedAt ? ` • ${getWorkshopWeekNumber(workshop)}. haftada` : " • Henüz başlamadı"}\nBu haftaki giriş: ${weeklyTracking.loginCount} / 7\nBu haftaki 5 paragraf okuması: ${readingCount} / 7\nHaftalık plan: %${Number(progress.plan_percent || 0)}\nSon etkinlik: ${progress.last_activity ? formatDate(progress.last_activity) : "Henüz yok"}\n\nTamamlanan modüller:\n${completedIds.length ? completedIds.map(id => `${id}. ${MODULES.find(module => module.id === id)?.title || ""}`).join("\n") : "Henüz yok"}\n\nTamamlanan özel ders haftaları:\n${workshopCompleted.length ? workshopCompleted.map(id => `${id}. ${WORKSHOP_MODULES.find(module => module.id === id)?.title || ""}`).join("\n") : "Henüz yok"}\n\nSon uygulama:\n${lastAnswerText}`;
}

async function createTeacherClass(form) {
  const name = form.elements.className.value.trim();
  const code = form.elements.classCode.value.trim().toUpperCase();
  const message = form.querySelector("[data-form-message]");
  if (!name || code.length < 6) {
    message.textContent = "Sınıf adı ve en az 6 karakterli bir kod yazın.";
    message.className = "login-message show error";
    return;
  }
  setFormBusy(form, true, "Oluşturuluyor…");
  const { error } = await cloudClient.rpc("teacher_create_class", { p_name: name, p_code: code });
  setFormBusy(form, false);
  if (error) {
    message.textContent = error.message || "Sınıf oluşturulamadı.";
    message.className = "login-message show error";
    return;
  }
  showToast("Yeni sınıf oluşturuldu. Şimdi öğrencileri ekleyebilirsiniz. 🏫");
  await loadTeacherData();
}

async function addTeacherStudent(form) {
  const name = form.elements.studentName.value.trim();
  const code = form.elements.studentCode.value.trim().toUpperCase();
  const message = form.querySelector("[data-form-message]");
  if (!name || code.length < 6) {
    message.textContent = "Öğrenci adı ve en az 6 karakterli bir kod yazın.";
    message.className = "login-message show error";
    return;
  }
  setFormBusy(form, true, "Kaydediliyor…");
  const { error } = await cloudClient.rpc("teacher_add_student", { p_class_id: teacherStore.activeClassId, p_name: name, p_code: code });
  setFormBusy(form, false);
  if (error) {
    message.textContent = error.message || "Öğrenci eklenemedi.";
    message.className = "login-message show error";
    return;
  }
  showToast(`${name} sınıfa eklendi. Giriş kodunu öğrenciyle paylaşabilirsiniz. 🎒`);
  await loadTeacherData();
}

async function updateTeacherStudent(form) {
  const studentId = form.dataset.studentId;
  const name = form.elements.studentName.value.trim();
  const code = form.elements.studentCode.value.trim().toUpperCase();
  const message = form.querySelector("[data-form-message]");
  if (!name || code.length < 6) {
    message.textContent = "Öğrenci adı ve en az 6 karakterli bir giriş kodu yazın.";
    message.className = "login-message show error";
    return;
  }
  setFormBusy(form, true, "Kaydediliyor…");
  const { error } = await cloudClient.rpc("teacher_update_student", { p_student_id: studentId, p_name: name, p_code: code });
  setFormBusy(form, false);
  if (error) {
    message.textContent = error.message || "Öğrenci bilgileri güncellenemedi.";
    message.className = "login-message show error";
    return;
  }
  document.querySelector("#student-management-modal")?.remove();
  showToast(`${name} için giriş bilgileri güncellendi. ✓`);
  await loadTeacherData();
}

async function resetTeacherStudentProgress(studentId) {
  const student = teacherStore.students.find(item => item.id === studentId);
  if (!student) return;
  const confirmed = window.confirm(`${student.name} adlı öğrencinin tüm modül cevapları ve haftalık planı sıfırlanacak. Öğrenci hesabı korunacak. Devam etmek istiyor musunuz?`);
  if (!confirmed) return;
  const { error } = await cloudClient.rpc("teacher_reset_student_progress", { p_student_id: studentId });
  if (error) {
    showToast("İlerleme sıfırlanamadı. Lütfen tekrar deneyin.", "error");
    return;
  }
  document.querySelector("#student-management-modal")?.remove();
  showToast(`${student.name} için çalışma ilerlemesi sıfırlandı.`);
  await loadTeacherData();
}

async function deleteTeacherStudent(studentId) {
  const student = teacherStore.students.find(item => item.id === studentId);
  if (!student) return;
  const confirmed = window.confirm(`${student.name} adlı öğrenci ve tüm çalışma verileri kalıcı olarak silinecek. Bu işlem geri alınamaz. Silmek istediğinize emin misiniz?`);
  if (!confirmed) return;
  const { error } = await cloudClient.rpc("teacher_delete_student", { p_student_id: studentId });
  if (error) {
    showToast("Öğrenci silinemedi. Lütfen tekrar deneyin.", "error");
    return;
  }
  document.querySelector("#student-management-modal")?.remove();
  showToast(`${student.name} sınıftan silindi.`);
  await loadTeacherData();
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage);
  } catch (error) {
    showToast("Kopyalama izni verilemedi. Metni elle seçebilirsiniz.", "error");
  }
}

async function studentLogout() {
  await synchronizeStudent();
  localStorage.removeItem(STORAGE_KEYS.cloudSession);
  cloudSession = null;
  showWorkspace("gateway");
  document.querySelector("#student-login-form")?.reset();
}

async function teacherLogout() {
  await cloudClient?.auth.signOut({ scope: "local" });
  localStorage.removeItem(STORAGE_KEYS.cloudSession);
  cloudSession = null;
  teacherStore = { classes: [], students: [], activeClassId: null, selectedStudentId: null, reportWeekKey: null };
  teacherPanelView = "dashboard";
  showWorkspace("gateway");
  document.querySelector("#teacher-login-form")?.reset();
}

function resetAllData() {
  const confirmed = window.confirm("Tüm cevapların, Akademi ve özel ders atölyesi ilerlemen, haftalık planın ve ayarların silinecek. Yeni bir başlangıç yapmak istediğine emin misin?");
  if (!confirmed) return;
  Object.values(STORAGE_KEYS).filter(key => key !== STORAGE_KEYS.cloudSession).forEach(key => localStorage.removeItem(key));
  state.settings = { studentName: "", dailyGoal: 30, theme: "blue" };
  state.answers = {};
  state.checks = {};
  state.completed = {};
  state.plan = createEmptyPlan();
  state.planHistory = {};
  state.planWeekKey = null;
  state.quizzes = {};
  state.activities = {};
  state.attendance = {};
  state.readingLog = {};
  state.workshop = createEmptyWorkshopState();
  state.onboardingDone = false;
  onboardingStep = 0;
  persistStudentStateLocally();
  scheduleStudentSync();
  showToast("Tüm veriler temizlendi. Yeni bir başlangıç yapabilirsin. 🌱");
  navigate("home");
}

function handleQuizAnswer(moduleId, selected) {
  const quiz = MODULE_EXTRAS[moduleId]?.quiz;
  if (!quiz || !Number.isInteger(selected)) return;
  state.quizzes[moduleId] = { selected, answeredAt: new Date().toISOString() };
  saveData(STORAGE_KEYS.quizzes, state.quizzes);
  const quizElement = document.querySelector(`#module-quiz-${moduleId}`);
  if (quizElement) quizElement.outerHTML = renderModuleQuiz(moduleId);
  updateModuleProgressFromState(moduleId);
  if (selected === quiz.answer) showToast("Doğru cevap! Yöntemi yakaladın. 🌟");
}

function ensureActivityRecord(moduleId) {
  if (!state.activities[moduleId]) state.activities[moduleId] = { choices: {}, missionDays: [] };
  if (!state.activities[moduleId].choices) state.activities[moduleId].choices = {};
  if (!Array.isArray(state.activities[moduleId].missionDays)) state.activities[moduleId].missionDays = [];
  const reflection = document.querySelector(`#activity-reflection-${moduleId}`);
  if (reflection) state.activities[moduleId].reflection = reflection.value.trim();
  return state.activities[moduleId];
}

function updateModuleProgressFromState(moduleId) {
  const module = MODULES.find(item => item.id === moduleId);
  if (!module) return;
  const filled = module.fields.filter(field => String(state.answers[moduleId]?.values?.[field[0]] || "").trim()).length;
  const checked = (state.checks[moduleId] || []).filter(Boolean).length;
  const quizPoint = Number.isInteger(state.quizzes[moduleId]?.selected) ? 1 : 0;
  const labPoint = state.completed[moduleId] || Object.keys(state.activities[moduleId]?.choices || {}).length === ACTIVITY_LABS[moduleId].items.length ? 1 : 0;
  const readingPoint = state.completed[moduleId] || hasReadingForModule(moduleId) ? 1 : 0;
  const progress = Math.round(((filled + checked + quizPoint + labPoint + readingPoint) / (module.fields.length + module.checks.length + 3)) * 100);
  const progressFill = document.querySelector(".module-progress .progress-fill");
  const progressValue = document.querySelector(".module-progress .progress-line strong");
  if (progressFill) progressFill.style.width = `${progress}%`;
  if (progressValue) progressValue.textContent = `%${progress}`;
}

function refreshInteractiveLab(moduleId) {
  saveData(STORAGE_KEYS.activities, state.activities);
  const element = document.querySelector(`#activity-lab-${moduleId}`);
  if (element) element.outerHTML = renderInteractiveLab(moduleId);
  updateModuleProgressFromState(moduleId);
}

function handleActivityChoice(moduleId, itemIndex, category) {
  const record = ensureActivityRecord(moduleId);
  record.choices[itemIndex] = category;
  record.updatedAt = new Date().toISOString();
  refreshInteractiveLab(moduleId);
}

function handleActivityConfidence(moduleId, stage, value) {
  const record = ensureActivityRecord(moduleId);
  if (stage === "before") record.confidenceBefore = value;
  else record.confidenceAfter = value;
  record.updatedAt = new Date().toISOString();
  refreshInteractiveLab(moduleId);
}

function handleActivityDay(moduleId, dayIndex) {
  const record = ensureActivityRecord(moduleId);
  record.missionDays[dayIndex] = !record.missionDays[dayIndex];
  record.updatedAt = new Date().toISOString();
  refreshInteractiveLab(moduleId);
  if (record.missionDays.filter(Boolean).length === 7) showToast("7 günlük görevi tamamladın! Bu gerçek bir alışkanlık adımı. 🏆");
}

function saveActivityReflection(moduleId) {
  const record = ensureActivityRecord(moduleId);
  record.updatedAt = new Date().toISOString();
  saveData(STORAGE_KEYS.activities, state.activities);
  showToast("Etkinlik düşüncen kaydedildi. ✨");
}

function getReadingTargetDay(targetDateKey) {
  const tracking = getReadingWeek();
  const target = tracking.days.find(day => day.key === targetDateKey) || tracking.days.find(day => day.key === tracking.todayKey);
  return { tracking, target };
}

function selectReadingDay(moduleId, targetDateKey) {
  const { tracking, target } = getReadingTargetDay(targetDateKey);
  if (!target || target.key > tracking.todayKey) return;
  readingTargetDateKey = target.key;
  const currentMission = document.querySelector(`#reading-mission-${moduleId}`);
  if (currentMission) currentMission.outerHTML = renderReadingMission(moduleId);
}

function handleReadingWorkshopVisit(moduleId, targetDateKey = getReadingWeek().todayKey) {
  const { tracking, target } = getReadingTargetDay(targetDateKey);
  if (!target || target.key > tracking.todayKey) return;
  const existing = state.readingLog[target.key] || {};
  state.readingLog[target.key] = {
    ...existing,
    moduleId: existing.completedAt ? existing.moduleId : moduleId,
    weekKey: getReadingWeek(target.date).weekKey,
    readingDate: target.key,
    visitedAt: new Date().toISOString(),
    visitedForDate: target.key
  };
  saveData(STORAGE_KEYS.readingLog, state.readingLog);
  readingTargetDateKey = target.key;
  const currentMission = document.querySelector(`#reading-mission-${moduleId}`);
  if (currentMission) currentMission.outerHTML = renderReadingMission(moduleId);
}

function handleDailyReadingCompletion(moduleId, targetDateKey = getReadingWeek().todayKey) {
  const { tracking, target } = getReadingTargetDay(targetDateKey);
  if (!target || target.key > tracking.todayKey) return;
  const existing = state.readingLog[target.key] || {};
  if (!existing.visitedAt) {
    showToast("Önce Okuma Atölyesi’ni açıp seçtiğin günün 5 paragrafını okuyabilirsin.", "error");
    return;
  }
  if (isReadingEntryCompleted(existing)) {
    showToast("Bu günün okuma kaydı zaten tamamlandı. ✓");
    return;
  }
  const completedAt = new Date().toISOString();
  const isLate = target.key !== tracking.todayKey;
  state.readingLog[target.key] = { ...existing, moduleId, weekKey: getReadingWeek(target.date).weekKey, readingDate: target.key, paragraphs: 5, completedAt, completedOn: tracking.todayKey, late: isLate, lateAt: isLate ? completedAt : null };
  saveData(STORAGE_KEYS.readingLog, state.readingLog);
  const record = ensureActivityRecord(moduleId);
  record.readingCompleted = true;
  record.readingCompletedAt = record.readingCompletedAt || completedAt;
  record.updatedAt = completedAt;
  saveData(STORAGE_KEYS.activities, state.activities);
  const currentMission = document.querySelector(`#reading-mission-${moduleId}`);
  if (currentMission) currentMission.outerHTML = renderReadingMission(moduleId);
  updateModuleProgressFromState(moduleId);
  const weeklyCount = getWeeklyTracking().readingCount;
  showToast(`${isLate ? "Kaçırdığın gün telafi edildi" : "Bugünün 5 paragrafı tamamlandı"}. Bu hafta ${weeklyCount}/7 gün! 📚`);
  if (state.page === "home") renderHome();
}

document.addEventListener("click", event => {
  const authTab = event.target.closest("[data-auth-tab]");
  if (authTab) {
    const role = authTab.dataset.authTab;
    document.querySelectorAll("[data-auth-tab]").forEach(button => {
      const active = button.dataset.authTab === role;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.querySelector("#student-login-form").hidden = role !== "student";
    document.querySelector("#teacher-login-form").hidden = role !== "teacher";
    return;
  }

  const pageButton = event.target.closest("[data-page]");
  if (pageButton) {
    navigate(pageButton.dataset.page);
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  const action = actionButton.dataset.action;

  if (studentPreviewMode && PREVIEW_BLOCKED_ACTIONS.has(action)) {
    event.preventDefault();
    showToast("Bu ekran öğretmen önizlemesidir. Öğrenci verilerinde değişiklik yapılamaz.", "error");
    return;
  }

  if (action === "onboarding-next") {
    if (onboardingStep >= STUDENT_ONBOARDING_STEPS.length - 1) {
      state.onboardingDone = true;
      saveData(STORAGE_KEYS.onboarding, true);
      showToast("Hazırsın! Bugünün küçük adımıyla başlayabilirsin. 🌱");
    } else onboardingStep += 1;
    renderHome();
  }
  else if (action === "close-onboarding") {
    state.onboardingDone = true;
    saveData(STORAGE_KEYS.onboarding, true);
    renderHome();
  }
  else if (action === "open-module") navigate("modules", { moduleId: Number(actionButton.dataset.moduleId) });
  else if (action === "start-workshop") startWorkshopJourney();
  else if (action === "open-workshop-module") navigate("workshop", { workshopModuleId: Number(actionButton.dataset.workshopModuleId) });
  else if (action === "back-workshop") navigate("workshop");
  else if (action === "workshop-quiz-option") handleWorkshopQuiz(Number(actionButton.dataset.workshopModuleId), Number(actionButton.dataset.optionIndex));
  else if (action === "save-workshop-draft") {
    const form = document.querySelector("#workshop-module-form");
    if (saveWorkshopDraft(form)) {
      showToast("Atölye taslağın kaydedildi. İstediğinde devam edebilirsin. 💾");
      renderWorkshopModuleDetail(Number(form.dataset.workshopModuleId));
    }
  }
  else if (action === "open-home-warning") {
    const moduleId = Number(actionButton.dataset.moduleId);
    readingTargetDateKey = actionButton.dataset.warningDate || null;
    navigate("modules", { moduleId: moduleId || getNextModule()?.id });
  }
  else if (action === "back-modules") navigate("modules");
  else if (action === "quiz-option") handleQuizAnswer(Number(actionButton.dataset.moduleId), Number(actionButton.dataset.optionIndex));
  else if (action === "activity-choice") handleActivityChoice(Number(actionButton.dataset.moduleId), Number(actionButton.dataset.itemIndex), actionButton.dataset.category);
  else if (action === "activity-confidence") handleActivityConfidence(Number(actionButton.dataset.moduleId), actionButton.dataset.stage, Number(actionButton.dataset.value));
  else if (action === "activity-day") handleActivityDay(Number(actionButton.dataset.moduleId), Number(actionButton.dataset.dayIndex));
  else if (action === "save-activity-reflection") saveActivityReflection(Number(actionButton.dataset.moduleId));
  else if (action === "select-reading-day") selectReadingDay(Number(actionButton.dataset.moduleId), actionButton.dataset.readingDate);
  else if (action === "visit-reading-workshop") handleReadingWorkshopVisit(Number(actionButton.dataset.moduleId), actionButton.dataset.readingDate);
  else if (action === "complete-daily-reading") handleDailyReadingCompletion(Number(actionButton.dataset.moduleId), actionButton.dataset.readingDate);
  else if (action === "save-draft") {
    const form = document.querySelector("#module-form");
    if (saveModuleDraft(form)) {
      showToast("Taslağın bu cihazda saklandı. İstediğinde devam edebilirsin. 💾");
      renderModuleDetail(Number(form.dataset.moduleId));
    }
  }
  else if (action === "add-plan-task") addPlanTask(actionButton.dataset.day);
  else if (action === "remove-plan-task") removePlanTask(actionButton.dataset.planId);
  else if (action === "clear-plan") {
    if (window.confirm("Haftalık planındaki tüm alanları temizlemek istediğine emin misin?")) {
      state.plan = createEmptyPlan();
      saveCurrentPlanSnapshot();
      renderPlan();
      showToast("Plan temizlendi. Yeni bir hafta planlayabilirsin. 🌿");
    }
  }
  else if (action === "copy-report") copyReport();
  else if (action === "download-student-backup") downloadCurrentStudentBackup();
  else if (action === "share-whatsapp") window.open(`https://wa.me/?text=${encodeURIComponent(buildReportText())}`, "_blank", "noopener,noreferrer");
  else if (action === "share-email") window.location.href = `mailto:?subject=${encodeURIComponent("Verimli Ders Çalışma Akademisi - Gelişim Raporum")}&body=${encodeURIComponent(buildReportText())}`;
  else if (action === "select-theme") {
    const form = document.querySelector("#settings-form");
    form.elements.theme.value = actionButton.dataset.theme;
    state.settings.theme = actionButton.dataset.theme;
    applyTheme();
    document.querySelectorAll(".theme-option").forEach(button => {
      const active = button === actionButton;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }
  else if (action === "reset-data") resetAllData();
  else if (action === "student-logout") studentLogout();
  else if (action === "teacher-logout") teacherLogout();
  else if (action === "reload-teacher") loadTeacherData();
  else if (action === "open-module-manager") {
    teacherPanelView = "modules";
    renderTeacherModuleManager();
  }
  else if (action === "open-workshop-tracking") {
    teacherPanelView = "workshop";
    renderTeacherWorkshopTracking();
  }
  else if (action === "back-teacher-dashboard") {
    teacherPanelView = "dashboard";
    renderTeacherDashboard();
  }
  else if (action === "new-module") openTeacherModuleEditor();
  else if (action === "edit-module") {
    document.querySelector("#teacher-module-preview")?.remove();
    openTeacherModuleEditor(actionButton.dataset.moduleId);
  }
  else if (action === "inspect-module") inspectTeacherModule(actionButton.dataset.moduleId);
  else if (action === "close-module-editor") document.querySelector("#teacher-module-editor")?.remove();
  else if (action === "close-module-preview") document.querySelector("#teacher-module-preview")?.remove();
  else if (action === "toggle-module") toggleTeacherModule(actionButton.dataset.moduleId);
  else if (action === "export-module-catalog") exportModuleCatalog();
  else if (action === "select-teacher-class") {
    teacherStore.activeClassId = actionButton.dataset.classId;
    teacherStore.reportWeekKey = null;
    if (teacherPanelView === "workshop") renderTeacherWorkshopTracking();
    else renderTeacherDashboard();
  }
  else if (action === "select-report-week") {
    teacherStore.reportWeekKey = actionButton.dataset.weekKey;
    renderTeacherDashboard();
    document.querySelector(".teacher-history-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  else if (action === "copy-weekly-class-report") {
    const report = buildWeeklyClassReport(teacherStore.activeClassId, actionButton.dataset.weekKey);
    if (report) copyText(report, "Seçilen haftanın sınıf raporu kopyalandı. 📋");
  }
  else if (action === "toggle-add-student") {
    const form = document.querySelector("#add-student-form");
    form.hidden = !form.hidden;
    if (!form.hidden) form.elements.studentName.focus();
  }
  else if (action === "generate-student-code") {
    const form = document.querySelector("#add-student-form");
    const namePart = form.elements.studentName.value.trim().split(/\s+/)[0].toLocaleUpperCase("tr-TR").replace(/[^A-ZÇĞİÖŞÜ]/g, "").slice(0, 5) || "OGR";
    form.elements.studentCode.value = `${namePart}-${Math.floor(1000 + Math.random() * 9000)}`;
  }
  else if (action === "copy-class-code") copyText(actionButton.dataset.code, "Sınıf kodu kopyalandı. 📋");
  else if (action === "backup-class") downloadClassBackup(actionButton.dataset.classId);
  else if (action === "copy-student-code") copyText(actionButton.dataset.code, "Öğrenci kodu kopyalandı. 📋");
  else if (action === "backup-remote-student") downloadRemoteStudentBackup(actionButton.dataset.studentId);
  else if (action === "preview-student") openTeacherStudentPreview(actionButton.dataset.studentId);
  else if (action === "view-student") renderTeacherStudentDetail(actionButton.dataset.studentId);
  else if (action === "close-student-detail") document.querySelector("#teacher-student-modal")?.remove();
  else if (action === "manage-student") renderStudentManagementModal(actionButton.dataset.studentId);
  else if (action === "close-student-management") document.querySelector("#student-management-modal")?.remove();
  else if (action === "generate-edit-student-code") {
    const form = document.querySelector("#edit-student-form");
    const namePart = form.elements.studentName.value.trim().split(/\s+/)[0].toLocaleUpperCase("tr-TR").replace(/[^A-ZÇĞİÖŞÜ]/g, "").slice(0, 5) || "OGR";
    form.elements.studentCode.value = `${namePart}-${Math.floor(1000 + Math.random() * 9000)}`;
  }
  else if (action === "reset-student-progress") resetTeacherStudentProgress(actionButton.dataset.studentId);
  else if (action === "delete-student") deleteTeacherStudent(actionButton.dataset.studentId);
  else if (action === "refresh-student-preview") window.location.reload();
  else if (action === "close-student-preview") returnToTeacherPanel();
  else if (action === "print-student-report") openStudentPdfReport(actionButton.dataset.studentId);
  else if (action === "copy-remote-report") {
    const student = teacherStore.students.find(item => item.id === actionButton.dataset.studentId);
    if (student) copyText(buildRemoteStudentReport(student), `${student.name} için rapor kopyalandı. 📋`);
  }
});

document.addEventListener("submit", event => {
  event.preventDefault();
  if (studentPreviewMode) {
    showToast("Öğretmen önizlemesinde değişiklik kaydedilemez.", "error");
    return;
  }
  if (event.target.id === "module-form") completeModule(event.target);
  else if (event.target.id === "workshop-module-form") completeWorkshopModule(event.target);
  else if (event.target.id === "plan-form") savePlan(event.target);
  else if (event.target.id === "settings-form") saveSettings(event.target);
  else if (event.target.id === "student-login-form") handleStudentLogin(event.target);
  else if (event.target.id === "teacher-login-form") handleTeacherLogin(event.target);
  else if (event.target.id === "create-class-form") createTeacherClass(event.target);
  else if (event.target.id === "add-student-form") addTeacherStudent(event.target);
  else if (event.target.id === "edit-student-form") updateTeacherStudent(event.target);
  else if (event.target.id === "teacher-module-form") saveTeacherModule(event.target);
});

document.addEventListener("input", event => {
  if (event.target.id === "student-search") {
    const query = event.target.value.trim().toLocaleLowerCase("tr-TR");
    document.querySelectorAll("[data-student-row]").forEach(row => {
      row.hidden = query && !row.dataset.searchName.includes(query);
    });
  }
});

document.addEventListener("change", event => {
  if (event.target.matches('[data-backup-import="student"]')) {
    restoreCurrentStudentBackup(event.target.files?.[0]).finally(() => { event.target.value = ""; });
    return;
  }
  if (event.target.matches('#plan-form [data-plan-field="done"]')) {
    const card = event.target.closest("[data-plan-task]");
    const subject = card.querySelector('[data-plan-field="subject"]').value.trim();
    const topic = card.querySelector('[data-plan-field="topic"]').value.trim();
    const duration = Number(card.querySelector('[data-plan-field="duration"]').value);
    if (event.target.checked && (!subject || !topic || duration < 5)) {
      event.target.checked = false;
      showToast("Görevi tamamlamadan önce ders, konu ve çalışma süresini doldurabilirsin.", "error");
      return;
    }
    const isCompleted = event.target.checked;
    state.plan = readPlanForm();
    saveCurrentPlanSnapshot();
    renderPlan();
    showToast(isCompleted ? "Görev tamamlandı olarak kaydedildi. Harika! ✓" : "Görev yeniden devam ediyor olarak işaretlendi.");
  }
});

window.addEventListener("online", () => {
  if (cloudSession?.role === "student") synchronizeStudent();
});
window.addEventListener("offline", () => {
  if (cloudSession?.role === "student") updateCloudStatus("offline", "Çevrim dışı • yerel kayıt");
});

initializeApplication();

