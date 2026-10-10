const greekVoice = () =>
  speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('el'));

export function greekVoiceAvailable(): boolean {
  return typeof speechSynthesis !== 'undefined' && !!greekVoice();
}

export function speak(text: string): void {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'el-GR';
  const v = greekVoice();
  if (v) u.voice = v;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
