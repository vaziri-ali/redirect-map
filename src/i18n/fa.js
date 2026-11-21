const lineList = (lines, f) => f.list(lines.map((line) => `خط ${f.n(line)}`));

const INVALID_ROW = {
  MISSING_TARGET: 'ردیف مقصد ندارد. قالب درست: «مبدأ, مقصد».',
  MULTIPLE_ARROWS: 'ردیف بیش از یک فلش دارد.',
  TOO_MANY_COLUMNS: 'بیش از سه ستون است. با کاما یا Tab جدا کنید یا فاصلهٔ داخل URL را %20 بنویسید.',
};

const INVALID_URL = {
  EMPTY: 'خالی است',
  UNSUPPORTED_SCHEME: 'پروتکلی جز http و https دارد',
  NO_PATH: 'مسیر ندارد',
  INVALID: 'URL معتبر نیست',
};

const PATTERN_INVALID = {
  REGEX: (p) => `عبارت منظم معتبر نیست: ${p.message}`,
  DUPLICATE_PARAM: (p) => `پارامتر :${p.name} دو بار در مبدأ آمده است.`,
  QUERY_IN_PATTERN: 'مبدأ wildcard فقط مسیر را تطبیق می‌دهد و نمی‌تواند query داشته باشد.',
  UNKNOWN_REFERENCE: (p) => `مقصد به ${p.token} اشاره می‌کند که مبدأ آن را نمی‌گیرد.`,
  INVALID_HOST: 'میزبان مبدأ معتبر نیست.',
};

const SKIPPED = {
  TOO_MANY_GROUPS: 'بیش از ۹ گروه می‌گیرد و این قالب بیشتر از آن را پشتیبانی نمی‌کند',
  REGEX_NOT_ANCHORED: 'عبارت منظم آن با ^/ شروع نمی‌شود',
  NAMED_GROUP: 'مقصد آن از گروه نام‌دار استفاده می‌کند که این قالب ندارد',
  UNSAFE_CHARACTERS: 'نویسه‌هایی دارد که در این قالب به‌صورت امن قابل نوشتن نیست',
  QUERY_NOT_SUPPORTED: 'این قالب تطبیق روی query را پشتیبانی نمی‌کند',
  GONE_NOT_SUPPORTED: 'این قالب پاسخ ۴۱۰ را پشتیبانی نمی‌کند',
  REGEX_NOT_SUPPORTED: 'این قالب عبارت منظم را پشتیبانی نمی‌کند',
  WILDCARD_POSITION: 'این قالب فقط یک wildcard در انتهای مسیر را می‌پذیرد',
};

export default {
  locale: 'fa',
  direction: 'rtl',
  issues: {
    ROW_LIMIT: (p, f) => ({
      title: `فقط ${f.n(p.max)} ردیف اول خوانده شد`,
      detail: 'فایل را به بخش‌های کوچک‌تر تقسیم کنید.',
    }),
    BASE_INVALID: () => ({
      title: 'آدرس سایت معتبر نیست',
      detail: 'نادیده گرفته شد و سایت از روی داده‌ها تشخیص داده شد.',
    }),
    BASE_INFERRED: (p) => ({ title: `سایت از اولین مبدأ کامل تشخیص داده شد: ${p.host}` }),
    INVALID_ROW: (p) => ({
      title: 'ردیف خوانده نشد',
      detail: INVALID_ROW[p.reason],
      evidence: p.raw,
    }),
    INVALID_URL: (p) => ({
      title: `${p.side === 'source' ? 'مبدأ' : 'مقصد'} ${INVALID_URL[p.reason]}`,
      evidence: p.raw,
    }),
    MISSING_TARGET: (p) => ({
      title: 'مقصد ندارد',
      detail: 'برای صفحاتی که برای همیشه حذف شده‌اند از کد ۴۱۰ استفاده کنید.',
      evidence: p.raw,
    }),
    SELF_REDIRECT: (p) => ({
      title: 'ریدایرکت به خودش',
      evidence: p.url,
      fix: 'ردیف را حذف یا مقصد را اصلاح کنید.',
    }),
    DUPLICATE: (p, fmt) => ({
      title: `تکراری (مثل خط ${fmt.n(p.first)})`,
      evidence: p.raw,
      fix: 'ردیف تکراری نادیده گرفته شد.',
    }),
    CONFLICT: (p, fmt) => ({
      title: `مبدأ تکراری با مقصد متفاوت (مثل خط ${fmt.n(p.first)})`,
      detail: 'فقط ردیف اول استفاده می‌شود.',
      evidence: `${p.source} → ${p.targets.join('  |  ')}`,
      fix: 'یکی از دو ردیف را حذف یا اصلاح کنید.',
    }),
    LOOP: (p) => ({
      title: 'حلقهٔ ریدایرکت',
      detail: 'این آدرس‌ها هرگز به مقصد نمی‌رسند. ردیف‌ها از خروجی حذف شدند.',
      evidence: p.urls.join(' → '),
      fix: 'یکی از ردیف‌های حلقه را حذف کنید.',
    }),
    LOOP_FEEDER: (p, fmt) => ({
      title: `${fmt.n(p.count)} ردیف به یک حلقه ختم می‌شوند`,
      detail: 'این ردیف‌ها هم از خروجی حذف شدند.',
      evidence: lineList(p.lines, fmt),
    }),
    CHAIN: (p, fmt) => ({
      title: `زنجیرهٔ ریدایرکت (${fmt.n(p.steps)} گام)`,
      detail: p.final
        ? 'هر گام اضافه سرعت و اعتبار لینک را کم می‌کند.'
        : 'زنجیره به صفحه‌ای حذف‌شده (۴۱۰) می‌رسد؛ خود مبدأ مستقیم با ۴۱۰ پاسخ داده می‌شود.',
      evidence: p.path.join(' → '),
      fix: p.final
        ? `مبدأ را مستقیم به ${p.final} ببرید. خروجی همین کار را انجام داده است.`
        : 'مبدأ را حذف کنید یا جایگزینی زنده بدهید.',
    }),
    TOO_MANY_HOPS: (p, fmt) => ({
      title: `بیش از ${fmt.n(p.limit)} گام`,
      evidence: p.path.join(' → '),
    }),
    BROKEN_TARGET: (p) => ({
      title: 'یکی از قانون‌های زنجیره مقصد نامعتبر می‌سازد',
      evidence: p.path.join(' → '),
    }),
    BAD_STATUS: (p, fmt) => ({
      title: `${fmt.n(p.count)} ردیف با کد وضعیت پشتیبانی‌نشده`,
      detail: `کدهای مجاز: ۳۰۱، ۳۰۲، ۳۰۳، ۳۰۷، ۳۰۸ و ۴۱۰. به‌جای آن ${fmt.n(p.fallback)} استفاده شد.`,
      evidence: lineList(p.lines, fmt),
    }),
    TEMP_STATUS: (p, fmt) => ({
      title: `${fmt.n(p.count)} ردیف ریدایرکت موقت دارند (۳۰۲، ۳۰۳، ۳۰۷)`,
      detail: 'برای جابه‌جایی دائمی صفحه، ۳۰۱ یا ۳۰۸ سیگنال بهتری است.',
      evidence: lineList(p.lines, fmt),
    }),
    HTTP_TARGET: (p, fmt) => ({
      title: `${fmt.n(p.count)} مقصد روی سایت https آدرس http:// دارند`,
      detail: 'هر کدام یک ریدایرکت اضافه به https می‌سازد.',
      fix: 'مقصد را با https:// بنویسید.',
      evidence: lineList(p.lines, fmt),
    }),
    ROOT_BULK: (p, fmt) => ({
      title: `${fmt.n(p.count)} ردیف به صفحهٔ اصلی ریدایرکت می‌شوند`,
      detail: 'موتورهای جست‌وجو ریدایرکت انبوه به صفحهٔ اصلی را ممکن است soft 404 بدانند.',
      fix: 'برای هر صفحه نزدیک‌ترین مقصد مرتبط را بدهید یا اگر جایگزینی نیست، ۴۱۰ برگردانید.',
      evidence: lineList(p.lines, fmt),
    }),
    FOREIGN_HOST: (p, fmt) => ({
      title: `${fmt.n(p.count)} مبدأ روی میزبانی غیر از ${p.host} هستند`,
      detail: 'در خروجی فقط مسیر استفاده می‌شود. این قانون‌ها را روی میزبان دیگر اجرا کنید.',
      evidence: lineList(p.lines, fmt),
    }),
    SPACES: (p, fmt) => ({
      title: `${fmt.n(p.count)} URL فاصله دارند`,
      detail: 'فاصله‌ها به %20 تبدیل شدند.',
      evidence: lineList(p.lines, fmt),
    }),
    HASH_IN_SOURCE: (p, fmt) => ({
      title: `${fmt.n(p.count)} مبدأ #fragment دارند`,
      detail: 'سرور بخش بعد از # را نمی‌بیند و از مبدأ حذف شد.',
      evidence: lineList(p.lines, fmt),
    }),
    BARE_DOMAIN: (p, fmt) => ({
      title: `${fmt.n(p.count)} آدرس بدون پروتکل`,
      detail: 'به‌صورت دامنه خوانده شدند و https:// گرفتند. مسیرها را با / شروع کنید.',
      evidence: lineList(p.lines, fmt),
    }),
    NON_ASCII: (p, fmt) => ({
      title: `${fmt.n(p.count)} مبدأ مسیر غیر لاتین دارند`,
      detail: 'خروجی هر پلتفرم به شکلی که انتظار دارد (رمزگشایی‌شده یا درصدکدگذاری) نوشته می‌شود.',
      evidence: lineList(p.lines, fmt),
    }),
    EXTRA_COLUMNS: (p, fmt) => ({
      title: `${fmt.n(p.count)} ردیف ستون اضافه دارند`,
      detail: 'فقط مبدأ، مقصد و کد وضعیت خوانده شد.',
      evidence: lineList(p.lines, fmt),
    }),
    IGNORED_ROWS: (p, fmt) => ({
      title: `${fmt.n(p.count)} ردیف بدون مقصد ریدایرکت نادیده گرفته شد`,
    }),
    GONE_WITH_TARGET: (p, fmt) => ({
      title: `${fmt.n(p.count)} ردیف با کد ۴۱۰ مقصد هم دارند`,
      detail: 'پاسخ ۴۱۰ مقصد ندارد و مقصد نادیده گرفته شد.',
      evidence: lineList(p.lines, fmt),
    }),
    PATTERN_INVALID: (p) => {
      const reason = PATTERN_INVALID[p.reason];
      return {
        title: 'قانون الگویی نامعتبر',
        detail: typeof reason === 'function' ? reason(p) : reason,
        evidence: p.raw,
      };
    },
    PATTERN_LOOP: (p) => ({
      title: 'قانون الگویی ممکن است حلقه بسازد',
      detail: `با ${p.sample} آزمایش شد؛ ریدایرکت‌ها هرگز تمام نمی‌شوند.`,
      evidence: p.path.join(' → '),
    }),
    PATTERN_CHAIN: (p, fmt) => ({
      title: 'قانون الگویی به ریدایرکت دیگری می‌رسد',
      detail: `با ${p.sample} آزمایش شد: ${fmt.n(p.steps)} گام.`,
      fix: p.final ? `مقصد را مستقیم به ${p.final} ببرید.` : 'مقصد را به صفحه‌ای زنده ببرید.',
    }),
    PATTERN_SHADOWED: (p, fmt) => ({
      title: `احتمالاً هرگز اعمال نمی‌شود: خط ${fmt.n(p.by)} زودتر تطبیق می‌یابد`,
      detail: `آدرسی مثل ${p.sample} را قانون قبلی می‌گیرد. مبدأهای دقیق بر الگوها مقدم‌اند و الگوها به ترتیب اجرا می‌شوند.`,
    }),
    PATTERN_CATCHALL: (p) => ({
      title: 'قانون فراگیر',
      detail: 'این قانون هر آدرسی را که قانون قبلی نگرفته باشد تطبیق می‌دهد.',
      evidence: p.source,
    }),
    REGEX_UNCHECKED: (p, fmt) => ({
      title: `${fmt.n(p.count)} قانون عبارت منظم برای حلقه آزمایش نشد`,
      detail: 'فقط قانون‌های wildcard خودکار بررسی می‌شوند. برای regex از ردیاب استفاده کنید.',
      evidence: lineList(p.lines, fmt),
    }),
    RULE_SKIPPED: (p) => ({ title: 'قانون نوشته نشد', detail: `چون ${SKIPPED[p.reason]}.` }),
    LIMIT_EXCEEDED: (p, fmt) => ({
      title: `تعداد قانون‌های ${p.kind === 'static' ? 'ایستا' : 'پویا'} زیاد است`,
      detail: `${fmt.n(p.count)} قانون، ولی پلتفرم ${fmt.n(p.limit)} قانون را می‌پذیرد.`,
    }),
  },
};
