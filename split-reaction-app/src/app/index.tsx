import React, { useRef, useState, useEffect } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useVideoPlayer, VideoView } from 'expo-video';

const SOURCE_VIDEO = require('@/assets/videos/sample.mp4');

export default function SplitScreenReaction() {
  const insets = useSafeAreaInsets();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const player = useVideoPlayer(SOURCE_VIDEO, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!cameraPermission?.granted) requestCameraPermission();
    if (!micPermission?.granted) requestMicPermission();
  }, [cameraPermission, micPermission, requestCameraPermission, requestMicPermission]);

  if (!cameraPermission || !micPermission) {
    return <View style={styles.container} />;
  }

  if (!cameraPermission.granted || !micPermission.granted) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.centered}>
          <Text style={styles.permissionText}>
            Camera and microphone access are required to record your reaction.
          </Text>
          <Pressable
            style={styles.button}
            onPress={() => {
              requestCameraPermission();
              requestMicPermission();
            }}>
            <Text style={styles.buttonText}>Grant Permissions</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const toggleReactionRecording = async () => {
    if (!cameraReady || !cameraRef.current) {
      Alert.alert('Camera not ready', 'Wait a moment for the camera to initialize.');
      return;
    }

    if (isRecording) {
      cameraRef.current.stopRecording();
      player.pause();
      setIsPlaying(false);
      setIsRecording(false);
      return;
    }

    try {
      setIsRecording(true);
      player.play();
      setIsPlaying(true);

      const recording = await cameraRef.current.recordAsync({ maxDuration: 600 });

      if (recording?.uri) {
        Alert.alert('Reaction saved', 'Your reaction clip was saved to the camera roll cache.');
      }
    } catch {
      Alert.alert('Recording failed', 'Could not record your reaction. Please try again.');
    } finally {
      player.pause();
      setIsPlaying(false);
      setIsRecording(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Top half: live front camera for your reaction */}
      <View style={styles.half}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="front"
          mode="video"
          mirror
          onCameraReady={() => setCameraReady(true)}
        />
        <View style={[styles.label, styles.topLabel, { top: insets.top + 8 }]}>
          <View style={[styles.recordingDot, isRecording && styles.recordingDotActive]} />
          <Text style={styles.labelText}>Your reaction</Text>
        </View>
        {!cameraReady && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color="#fff" />
          </View>
        )}
      </View>

      <View style={styles.divider} />

      {/* Bottom half: source content you are reacting to */}
      <View style={styles.half}>
        <VideoView
          style={StyleSheet.absoluteFill}
          player={player}
          contentFit="cover"
          nativeControls={false}
        />
        <View style={styles.label}>
          <Text style={styles.labelText}>Source</Text>
        </View>
      </View>

      <View style={[styles.controls, { bottom: insets.bottom + 24 }]}>
        <Pressable
          style={[styles.recordButton, isRecording && styles.recordButtonActive]}
          onPress={toggleReactionRecording}
          disabled={!cameraReady}>
          <View style={isRecording ? styles.stopIcon : styles.recordIcon} />
        </Pressable>
        <Text style={styles.controlHint}>
          {isRecording ? 'Recording reaction…' : isPlaying ? 'Playing source' : 'Tap to record reaction'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  half: {
    flex: 1,
    overflow: 'hidden',
  },
  divider: {
    height: 2,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionText: {
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  buttonText: {
    color: '#000',
    fontWeight: '600',
  },
  label: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  topLabel: {
    bottom: undefined,
  },
  labelText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  recordingDotActive: {
    backgroundColor: '#ff3b30',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  controls: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    gap: 10,
  },
  recordButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#fff',
  },
  recordButtonActive: {
    borderColor: '#ff3b30',
  },
  recordIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ff3b30',
  },
  stopIcon: {
    width: 24,
    height: 24,
    backgroundColor: '#fff',
    borderRadius: 4,
  },
  controlHint: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
});
