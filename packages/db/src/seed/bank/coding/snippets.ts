/** Helpers for the C reference solutions (C has no standard hash map or sort comparators). */

/** Open-addressing hash map long long → long long, sized up front for at most `n` keys. */
export const C_HMAP = `typedef struct {
    long long *keys;
    long long *vals;
    char *used;
    size_t cap;
} hmap;

static void hm_init(hmap *m, size_t n) {
    size_t c = 16;
    while (c < n * 2 + 2) c <<= 1;
    m->cap = c;
    m->keys = malloc(c * sizeof(long long));
    m->vals = calloc(c, sizeof(long long));
    m->used = calloc(c, 1);
}

static size_t hm_slot(const hmap *m, long long k) {
    unsigned long long h = (unsigned long long)k * 0x9E3779B97F4A7C15ULL;
    size_t i = (size_t)(h >> 17) & (m->cap - 1);
    while (m->used[i] && m->keys[i] != k) i = (i + 1) & (m->cap - 1);
    return i;
}

/* Pointer to the value, or NULL when the key is absent. */
static long long *hm_get(const hmap *m, long long k) {
    size_t i = hm_slot(m, k);
    return m->used[i] ? &m->vals[i] : NULL;
}

/* Pointer to the value, inserting 0 when the key is absent. */
static long long *hm_put(hmap *m, long long k) {
    size_t i = hm_slot(m, k);
    if (!m->used[i]) {
        m->used[i] = 1;
        m->keys[i] = k;
        m->vals[i] = 0;
    }
    return &m->vals[i];
}

static void hm_free(hmap *m) {
    free(m->keys);
    free(m->vals);
    free(m->used);
}`;

export const C_CMP_INT = `static int cmp_int(const void *a, const void *b) {
    int x = *(const int *)a, y = *(const int *)b;
    return (x > y) - (x < y);
}`;

export const C_CMP_LL = `static int cmp_ll(const void *a, const void *b) {
    long long x = *(const long long *)a, y = *(const long long *)b;
    return (x > y) - (x < y);
}`;

/** Copy of an int array (inputs are const). */
export const C_COPY = `static int *copy_ints(const int *a, int n) {
    int *r = malloc(sizeof(int) * (size_t)(n > 0 ? n : 1));
    if (n > 0) memcpy(r, a, sizeof(int) * (size_t)n);
    return r;
}`;

export const join = (...parts: string[]) => parts.join('\n\n');
