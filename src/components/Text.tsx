// App-wide Text and TextInput with the IBM Plex fonts applied.
//
// Screens keep writing normal styles (fontSize, fontWeight, …). These
// wrappers read the fontWeight, pick the right font file for it and for the
// current app language, and pass everything else through unchanged.
// Every screen imports Text / TextInput from here instead of react-native.
import { createContext, forwardRef, useContext } from 'react';
import {
  StyleProp,
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  TextInputProps,
  TextProps,
  TextStyle,
} from 'react-native';
import { useLanguage } from '../context/AppContext';
import { colors, fontFamilyFor } from '../theme';

// Phones with a large system font size still get bigger text, but capped so
// layouts (buttons, rows, cards) don't break. A screen can pass its own
// maxFontSizeMultiplier to override this.
const MAX_FONT_SCALE = 1.2;

// Nested <Text> inside a bold <Text> should stay bold, like plain React
// Native. The parent's font is passed down; a child only changes it when its
// own style sets a fontWeight.
const ParentFont = createContext<string | null>(null);

function resolveFont(style: StyleProp<TextStyle>, lang: 'en' | 'hi', parent: string | null) {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  // A style that already names a font (icons, monospace) is left alone.
  if (flat.fontFamily) return { style, family: flat.fontFamily };
  const family = flat.fontWeight == null && parent ? parent : fontFamilyFor(flat.fontWeight, lang);
  // fontWeight is reset so Android does not add fake bold on top of the
  // real semibold file.
  return { style: [style, { fontFamily: family, fontWeight: 'normal' as const }], family };
}

export const Text = forwardRef<RNText, TextProps>(function Text({ style, maxFontSizeMultiplier, ...rest }, ref) {
  const lang = useLanguage();
  const parent = useContext(ParentFont);
  const f = resolveFont(style, lang, parent);
  return (
    <ParentFont.Provider value={f.family}>
      <RNText
        ref={ref}
        style={f.style}
        maxFontSizeMultiplier={maxFontSizeMultiplier ?? MAX_FONT_SCALE}
        {...rest}
      />
    </ParentFont.Provider>
  );
});

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput(
  { style, maxFontSizeMultiplier, placeholderTextColor, ...rest },
  ref,
) {
  const lang = useLanguage();
  return (
    <RNTextInput
      ref={ref}
      style={resolveFont(style, lang, null).style}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? MAX_FONT_SCALE}
      placeholderTextColor={placeholderTextColor ?? colors.faint}
      {...rest}
    />
  );
});
