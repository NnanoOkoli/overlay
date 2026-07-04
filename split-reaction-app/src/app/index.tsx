import React, { useRef, useState, useEffect } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { WebView } from 'react-native-webview';

const SOURCES = [
  { key: 'tiktok', label: 'TikTok', url: 'https://www.tiktok.com/foryou' },
  { key: 'shorts', label: 'Shorts', url: 'https://m.youtube.com/shorts' },
  { key: 'youtube', label: 'YouTube', url: 'https://m.youtube.com' },
] as const;

type SourceKey = (typeof SOURCES)[number]['key'];

export default function SplitScreenReaction() {
  const insets = useSafeAreaInsets();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [isRecording, setIsRecording] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [activeSource, setActiveSource] = useState<SourceKey>('tiktok');
  const cameraRef = useRef<CameraView>(null);
  const webViewRef = useRef<WebView>(null);

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
      setIsRecording(false);
      return;
    }

    try {
      setIsRecording(true);
      const recording = await cameraRef.current.recordAsync({ maxDuration: 600 });
      if (recording?.uri) {
        Alert.alert('Reaction saved', 'Your reaction clip was recorded.');
      }
    } catch {
      Alert.alert('Recording failed', 'Could not record your reaction. Please try again.');
    } finally {
      setIsRecording(false);
    }
  };

  const source = SOURCES.find((s) => s.key === activeSource)!;

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
        <View style={[styles.label, { top: insets.top + 8 }]}>
          <View style={[styles.recordingDot, isRecording && styles.recordingDotActive]} />
          <Text style={styles.labelText}>
            {isRecording ? 'Recording…' : 'Your reaction'}
          </Text>
        </View>
        {!cameraReady && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color="#fff" />
          </View>
        )}

        {/* Record button lives on the camera half so it never blocks scrolling */}
        <Pressable
          style={[styles.recordButton, isRecording && styles.recordButtonActive]}
          onPress={toggleReactionRecording}
          disabled={!cameraReady}>
          <View style={isRecording ? styles.stopIcon : styles.recordIcon} />
        </Pressable>
      </View>

      {/* Source switcher bar */}
      <View style={styles.sourceBar}>
        {SOURCES.map((s) => (
          <Pressable
            key={s.key}
            style={[styles.sourceTab, activeSource === s.key && styles.sourceTabActive]}
            onPress={() => setActiveSource(s.key)}>
            <Text
              style={[
                styles.sourceTabText,
                activeSource === s.key && styles.sourceTabTextActive,
              ]}>
              {s.label}
            </Text>
          </Pressable>
        ))}
        <Pressable style={styles.sourceTab} onPress={() => webViewRef.current?.goBack()}>
          <Text style={styles.sourceTabText}>←</Text>
        </Pressable>
      </View>

      {/* Bottom half: scrollable streaming content you react to */}
      <View style={styles.half}>
        <WebView
          ref={webViewRef}
          source={{ uri: source.url }}
          style={styles.webview}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsBackForwardNavigationGestures
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
        />
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
  webview: {
    flex: 1,
    backgroundColor: '#000',
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
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
  recordButton: {
    position: 'absolute',
    right: 16,
    bottom: 12,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  recordButtonActive: {
    borderColor: '#ff3b30',
  },
  recordIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ff3b30',
  },
  stopIcon: {
    width: 20,
    height: 20,
    backgroundColor: '#fff',
    borderRadius: 4,
  },
  sourceBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#333',
  },
  sourceTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#222',
  },
  sourceTabActive: {
    backgroundColor: '#fff',
  },
  sourceTabText: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '600',
  },
  sourceTabTextActive: {
    color: '#000',
  },
});
