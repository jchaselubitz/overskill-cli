export type EditorCommand = {
  command: string;
  args: string[];
};

export function parseEditorCommand(editor: string): EditorCommand {
  const tokens = splitCommand(editor);
  if (tokens.length === 0) {
    throw new Error('Editor command is empty.');
  }

  return {
    command: tokens[0],
    args: tokens.slice(1),
  };
}

function splitCommand(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escape = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (escape) {
      current += char;
      escape = false;
      continue;
    }

    if (char === '\\' && quote !== "'") {
      const nextChar = input[i + 1];
      if (
        nextChar === '"' ||
        nextChar === "'" ||
        nextChar === '\\' ||
        (typeof nextChar === 'string' && /\s/.test(nextChar))
      ) {
        escape = true;
        continue;
      }
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}
