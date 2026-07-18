import cache from './cache';

const defaultBadWords: string[] = [
    // English
    'fuck you', 'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'damn',
    'dick', 'cock', 'pussy', 'slut', 'whore', 'crap', 'ass',
    // Hindi/Hinglish
    'chutiya', 'chutiye', 'chutia', 'bhosdi', 'bhosadike', 'madarchod',
    'madarchod', 'bhenchod', 'bhenchod', 'bsdk', 'bkl', 'mc', 'bc',
    'gandu', 'gand', 'laude', 'loda', 'lund', 'randi', 'kuttiya',
    'kutta', 'kutte', 'harami', 'haramkhor', 'suar', 'saala',
    'behenchod', 'behnchod', 'chod', 'chode', 'gaand', 'gaandu',
    // Urdu
    'bhen ke lode', 'madar chod', 'kutte ka', 'harami',
    // Common variations
    'f*ck', 'f**k', 'sh!t', 'b!tch', 'a$$hole',
    'chut!ya', 'g@ndu', 'l0da',
];

export function containsAbuse(text: string): boolean {
    const lowerText = text.toLowerCase();
    const words = cache.config.bad_words.length > 0
        ? cache.config.bad_words
        : defaultBadWords;

    for (const word of words) {
        if (lowerText.includes(word.toLowerCase())) {
            return true;
        }
    }
    return false;
}

export function getWarningMessage(): string {
    return cache.config.language.abuseWarning ||
        '⚠️ Please maintain a respectful language. Abusive messages are not tolerated. Continued abuse may result in a ban.';
}
