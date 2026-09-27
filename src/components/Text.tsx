// App-wide Text and TextInput with the IBM Plex fonts applied.
//
// Screens keep writing normal styles (fontSize, fontWeight, …). These
// wrappers read the fontWeight, pick the right font file for it and for the
// current app language, and pass everything else through unchanged.
// Batch 2 switches every `Text` / `TextInput` import to this file.
import { forwardRef } from 'react';
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
import { fontFamilyFor } from '../theme';

function withFont(style: StyleProp<TextStyle>, lang: 'en' | 'hi'): StyleProp<TextStyle> {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  // A style that already names a font (icons, monospace) is left alone.
  if (flat.fontFamily) return style;
  // fontWeight is reset so Android does not add fake bold on top of the
  // real semibold file.
  return [style, { fontFamily: fontFamilyFor(flat.fontWeight, lang), fontWeight: 'normal' }];
}

export const Text = forwardRef<RNText, TextProps>(function Text({ style, ...rest }, ref) {
  const lang = useLanguage();
  return <RNText ref={ref} style={withFont(style, lang)} {...rest} />;
});

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput({ style, ...rest }, ref) {
  const lang = useLanguage();
  return <RNTextInput ref={ref} style={withFont(style, lang)} {...rest} />;
});
