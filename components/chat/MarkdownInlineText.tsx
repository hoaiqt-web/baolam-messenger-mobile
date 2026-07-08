import { Text, type TextStyle } from 'react-native';

type Props = {
  text: string;
  baseStyle?: TextStyle | (TextStyle | undefined | false)[];
  boldStyle?: TextStyle | (TextStyle | undefined | false)[];
};

/** Renders `**bold**` segments inside a single Text node. */
export function MarkdownInlineText({ text, baseStyle, boldStyle }: Props) {
  const raw = String(text ?? '');
  if (!raw) return null;

  const parts = raw.split(/(\*\*[^*]+\*\*)/g);

  return (
    <Text style={baseStyle}>
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <Text key={index} style={boldStyle}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        return <Text key={index}>{part}</Text>;
      })}
    </Text>
  );
}
