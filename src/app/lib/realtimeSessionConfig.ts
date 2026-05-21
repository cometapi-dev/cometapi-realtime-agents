export type RealtimeTurnDetection = {
  type: "server_vad";
  threshold: number;
  prefix_padding_ms: number;
  silence_duration_ms: number;
  create_response: boolean;
};

export const pcm24kAudioFormat = {
  type: "audio/pcm",
  rate: 24000,
} as const;

export function createRealtimeSessionUpdate(
  turnDetection: RealtimeTurnDetection | null
) {
  return {
    type: "session.update",
    session: {
      type: "realtime",
      output_modalities: ["audio"],
      audio: {
        input: {
          format: pcm24kAudioFormat,
          turn_detection: turnDetection,
        },
        output: {
          format: pcm24kAudioFormat,
          voice: "alloy",
        },
      },
    },
  };
}
