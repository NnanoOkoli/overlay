import React, { useRef, useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  PanResponder,
  StyleSheet,
  Text,
  Pressable,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { VideoView, useVideoPlayer } from 'expo-video';
import { WebView } from 'react-native-webview';

const SOURCES = [
  { key: 'tiktok', label: 'TikTok', url: 'https://www.tiktok.com/foryou' },
  { key: 'shorts', label: 'Shorts', url: 'https://m.youtube.com/shorts' },
  { key: 'youtube', label: 'YouTube', url: 'https://m.youtube.com' },
  { key: 'library', label: 'My Video', url: '' },
] as const;

type SourceKey = (typeof SOURCES)[number]['key'];

const MIN_CAMERA_FRACTION = 0.18;
const MAX_CAMERA_FRACTION = 0.7;
const ZOOM_STEP = 0.1;

export default function SplitScreenReaction() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { height: windowHeight } = useWindowDimensions();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [isRecording, setIsRecording] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const [activeSource, setActiveSource] = useState<SourceKey>('tiktok');
  const [contentPaused, setContentPaused] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [cameraHeight, setCameraHeight] = useState(Math.round(windowHeight * 0.42));
  const [libraryVideoUri, setLibraryVideoUri] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const webViewRef = useRef<WebView>(null);
  const dragStartHeight = useRef(0);
  const wantRecordingRef = useRef(false);
  const segmentsRef = useRef<string[]>([]);

  // Player for videos the user imports from their Photos library.
  const libraryPlayer = useVideoPlayer(null, (p) => {
    p.loop = true;
  });

  // The camera is only mounted when the screen is focused AND the user has
  // started a recording session — it never runs during browsing/setup.
  const cameraMounted = isFocused && cameraActive;

  const minCameraHeight = Math.round(windowHeight * MIN_CAMERA_FRACTION);
  const maxCameraHeight = Math.round(windowHeight * MAX_CAMERA_FRACTION);

  // Refs keep gesture callbacks reading fresh values without re-creating responders.
  const cameraHeightRef = useRef(cameraHeight);
  cameraHeightRef.current = cameraHeight;
  const minCameraHeightRef = useRef(minCameraHeight);
  minCameraHeightRef.current = minCameraHeight;
  const maxCameraHeightRef = useRef(maxCameraHeight);
  maxCameraHeightRef.current = maxCameraHeight;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const cameraReadyRef = useRef(cameraReady);
  cameraReadyRef.current = cameraReady;
  const contentPausedRef = useRef(contentPaused);
  contentPausedRef.current = contentPaused;
  const activeSourceRef = useRef(activeSource);
  activeSourceRef.current = activeSource;

  // iOS pauses WebView media when the camera's capture session starts.
  // This re-issues play() to the content videos over the next few seconds
  // (unless the user paused them on purpose) so the stream keeps rolling
  // through the interruption.
  const resumeContentVideos = () => {
    const js = `
      document.querySelectorAll('video').forEach(function (v) {
        if (v.paused) v.play().catch(function () {});
      });
      true;
    `;
    [150, 500, 1000, 2000, 3500].forEach((ms) =>
      setTimeout(() => {
        if (contentPausedRef.current) return;
        if (activeSourceRef.current === 'library') {
          try {
            libraryPlayer.play();
          } catch {}
        } else {
          webViewRef.current?.injectJavaScript(js);
        }
      }, ms),
    );
  };

  const resizeResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dy) > 4,
      onPanResponderGrant: () => {
        dragStartHeight.current = cameraHeightRef.current;
      },
      onPanResponderMove: (_evt, gesture) => {
        const raw = Math.min(
          maxCameraHeightRef.current,
          Math.max(minCameraHeightRef.current, dragStartHeight.current + gesture.dy),
        );
        // Quantize to 8px steps so the camera view isn't re-laid-out on
        // every touch move — rapid re-layouts freeze the preview on iOS.
        const next = Math.round(raw / 8) * 8;
        if (next !== cameraHeightRef.current) setCameraHeight(next);
      },
    }),
  ).current;

  // Two-finger pinch on the camera pane adjusts zoom (0..1).
  const pinchStart = useRef({ distance: 0, zoom: 0 });
  const pinchResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length === 2,
      onMoveShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length === 2,
      onPanResponderGrant: (evt) => {
        const t = evt.nativeEvent.touches;
        if (t.length === 2) {
          pinchStart.current = {
            distance: Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY),
            zoom: zoomRef.current,
          };
        }
      },
      onPanResponderMove: (evt) => {
        const t = evt.nativeEvent.touches;
        if (t.length !== 2 || pinchStart.current.distance === 0) return;
        const distance = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
        const delta = (distance - pinchStart.current.distance) / 400;
        // Quantize to 0.05 steps — pushing a new zoom value to the native
        // camera on every touch move causes session reconfigures and freezes.
        const raw = Math.min(1, Math.max(0, pinchStart.current.zoom + delta));
        const next = Math.round(raw * 20) / 20;
        if (next !== zoomRef.current) setZoom(next);
      },
    }),
  ).current;

  useEffect(() => {
    // MixWithOthers keeps the mic/recording session alive while WebView videos play.
    Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      shouldDuckAndroid: true,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!cameraPermission?.granted) requestCameraPermission();
    if (!micPermission?.granted) requestMicPermission();
  }, [cameraPermission, micPermission, requestCameraPermission, requestMicPermission]);

  // Tear the camera down whenever the screen loses focus so the native
  // session never lingers invisibly in the background.
  useEffect(() => {
    if (!isFocused) {
      wantRecordingRef.current = false;
      cameraRef.current?.stopRecording();
      setCameraActive(false);
      setCameraReady(false);
    }
  }, [isFocused]);

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

  // Records in a loop: if the OS interrupts the recording (audio route change,
  // WebView media, resize, etc.) we save that segment and start a new one.
  // Escalating backoff plus a full camera remount after repeated failures
  // keeps the preview from ever staying frozen.
  const runRecordingLoop = async () => {
    let consecutiveFailures = 0;
    while (wantRecordingRef.current) {
      const camera = cameraRef.current;
      if (!camera || !cameraReadyRef.current) {
        // Camera still mounting/initializing — wait, don't fail.
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
      try {
        // Starting a capture segment is what pauses WebView media — queue
        // the auto-resume before the await so playback recovers instantly.
        resumeContentVideos();
        const recording = await camera.recordAsync({ maxDuration: 600 });
        if (recording?.uri) {
          segmentsRef.current.push(recording.uri);
          consecutiveFailures = 0;
        }
      } catch {
        consecutiveFailures += 1;
        if (consecutiveFailures >= 3) {
          // The session is wedged — remount the camera entirely.
          setCameraReady(false);
          setCameraKey((k) => k + 1);
          consecutiveFailures = 0;
          await new Promise((r) => setTimeout(r, 1200));
        } else {
          try {
            await camera.resumePreview();
          } catch {}
          await new Promise((r) => setTimeout(r, 500 * consecutiveFailures));
        }
      }
    }
  };

  const toggleReactionRecording = async () => {
    if (isRecording) {
      wantRecordingRef.current = false;
      cameraRef.current?.stopRecording();
      // Power the camera down after the take — it stays off while browsing.
      setCameraActive(false);
      setCameraReady(false);
      // Session teardown can also pause WebView media — recover it.
      resumeContentVideos();
      return;
    }

    // Re-assert the audio mode right before recording — WebView playback can
    // silently reconfigure the session between takes.
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      shouldDuckAndroid: true,
    }).catch(() => {});

    // Mount the camera now — the recording loop waits until it's ready.
    setCameraActive(true);
    segmentsRef.current = [];
    wantRecordingRef.current = true;
    setIsRecording(true);
    await runRecordingLoop();
    setIsRecording(false);

    const clips = segmentsRef.current;
    if (clips.length === 0) return;

    // Save the clips to the iPhone Photos library so they show up in Recents.
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Clip recorded, but not saved',
        'Allow Photos access in Settings so your reactions can be saved to your camera roll.',
      );
      return;
    }

    let saved = 0;
    for (const uri of clips) {
      try {
        await MediaLibrary.saveToLibraryAsync(uri);
        saved += 1;
      } catch {}
    }

    if (saved > 0) {
      Alert.alert(
        'Reaction saved to Photos',
        saved === 1 ? 'Your reaction clip is in your camera roll.' : `${saved} clips are in your camera roll.`,
      );
    } else {
      Alert.alert('Save failed', 'The clip was recorded but could not be saved to Photos.');
    }
  };

  // Turns the camera preview on/off without recording — used when the user
  // captures the composed screen with iOS screen recording instead.
  const toggleCameraPower = () => {
    if (isRecording) return; // the in-app recording flow owns the camera
    setCameraActive((on) => {
      if (on) setCameraReady(false);
      return !on;
    });
  };

  // Lets the user import a video from their Photos library to react to.
  const pickLibraryVideo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Photos access needed',
        'Allow Photos access in Settings to import a video to react to.',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsMultipleSelection: false,
    });
    const uri = result.canceled ? null : result.assets[0]?.uri;
    if (uri) {
      setLibraryVideoUri(uri);
      libraryPlayer.replace(uri);
      libraryPlayer.play();
      setContentPaused(false);
    }
  };

  // Pauses/plays the content being reacted to (WebView videos or the imported
  // clip). The camera recording runs natively and is unaffected by this.
  const toggleContentPlayback = () => {
    if (activeSource === 'library') {
      if (contentPaused) libraryPlayer.play();
      else libraryPlayer.pause();
      setContentPaused(!contentPaused);
      return;
    }
    const next = !contentPaused;
    webViewRef.current?.injectJavaScript(`
      (function () {
        document.querySelectorAll('video').forEach(function (v) {
          ${next ? 'v.pause();' : 'v.play().catch(function () {});'}
        });
      })();
      true;
    `);
    setContentPaused(next);
  };

  const adjustZoom = (delta: number) => {
    setZoom((z) => Math.min(1, Math.max(0, +(z + delta).toFixed(2))));
  };

  const source = SOURCES.find((s) => s.key === activeSource)!;

  return (
    <View style={styles.container}>
      {/* Reaction camera — mounted only while focused and recording */}
      <View style={[styles.cameraPane, { height: cameraHeight }]} {...pinchResponder.panHandlers}>
        {cameraMounted ? (
          <CameraView
            key={cameraKey}
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="front"
            mode="video"
            mirror
            zoom={zoom}
            onCameraReady={() => {
              setCameraReady(true);
              // Camera session startup pauses WebView media — recover it.
              resumeContentVideos();
            }}
            onMountError={() => {
              // Force a clean remount so the preview never stays frozen.
              setCameraReady(false);
              setCameraKey((k) => k + 1);
            }}
          />
        ) : (
          <View style={styles.cameraIdle}>
            <Image
              source={require('@/assets/images/camera-placeholder.png')}
              style={styles.cameraIdleImage}
              resizeMode="contain"
            />
            <Text style={styles.cameraIdleTitle}>Camera off</Text>
            <Text style={styles.cameraIdleHint}>
              Turn the camera on, then use iOS screen recording to capture your reaction with the
              content — or tap record to save a selfie clip
            </Text>
          </View>
        )}
        <View style={[styles.label, { top: insets.top + 8 }]}>
          <View style={[styles.recordingDot, isRecording && styles.recordingDotActive]} />
          <Text style={styles.labelText}>
            {isRecording ? 'Recording…' : cameraMounted ? 'Your reaction' : 'Standby'}
          </Text>
        </View>
        {/* Camera power toggle — lets the preview run for iOS screen recording */}
        <Pressable
          style={[styles.cameraToggle, { top: insets.top + 8 }]}
          onPress={toggleCameraPower}
          disabled={isRecording}>
          <Text style={styles.cameraToggleText}>
            {cameraMounted ? 'Camera: on' : 'Camera: off'}
          </Text>
        </Pressable>
        {cameraMounted && !cameraReady && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color="#fff" />
          </View>
        )}

        {/* Zoom controls — vertical, translucent, only while the camera is live */}
        {cameraMounted && (
          <View style={styles.zoomControls}>
            <Pressable style={styles.zoomButton} onPress={() => adjustZoom(ZOOM_STEP)}>
              <Text style={styles.zoomButtonText}>+</Text>
            </Pressable>
            <Text style={styles.zoomValue}>{`${(1 + zoom * 4).toFixed(1)}x`}</Text>
            <Pressable style={styles.zoomButton} onPress={() => adjustZoom(-ZOOM_STEP)}>
              <Text style={styles.zoomButtonText}>−</Text>
            </Pressable>
          </View>
        )}

        <Pressable
          style={[styles.recordButton, isRecording && styles.recordButtonActive]}
          onPress={toggleReactionRecording}>
          <View style={isRecording ? styles.stopIcon : styles.recordIcon} />
        </Pressable>

        {/* Floating drag handle on the camera's bottom edge — no divider bar */}
        <View style={styles.dragHandle} {...resizeResponder.panHandlers}>
          <View style={styles.dragHandleBar} />
        </View>
      </View>

      {/* Content you react to: streaming sites or an imported video */}
      <View style={styles.contentPane}>
        {activeSource === 'library' ? (
          libraryVideoUri ? (
            <View style={styles.libraryWrap}>
              <VideoView
                player={libraryPlayer}
                style={styles.webview}
                contentFit="contain"
                nativeControls={false}
              />
              <Pressable style={styles.changeVideoButton} onPress={pickLibraryVideo}>
                <Text style={styles.changeVideoText}>Change video</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.libraryEmpty}>
              <Text style={styles.libraryTitle}>React to your own video</Text>
              <Text style={styles.libraryHint}>
                Import a clip from your Photos library and record your reaction to it.
              </Text>
              <Pressable style={styles.importButton} onPress={pickLibraryVideo}>
                <Text style={styles.importButtonText}>Choose from Photos</Text>
              </Pressable>
            </View>
          )
        ) : (
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
        )}
      </View>

      {/* Bottom bar: source tabs + stream pause/play, under the content */}
      <View style={[styles.sourceBar, { paddingBottom: insets.bottom + 6 }]}>
        {SOURCES.map((s) => (
          <Pressable
            key={s.key}
            style={[styles.sourceTab, activeSource === s.key && styles.sourceTabActive]}
            onPress={() => {
              setActiveSource(s.key);
              setContentPaused(false);
              // The imported-video player lives outside the view tree, so
              // silence it when leaving the tab and resume when returning.
              if (s.key === 'library') {
                if (libraryVideoUri) libraryPlayer.play();
              } else {
                libraryPlayer.pause();
              }
            }}>
            <Text
              style={[styles.sourceTabText, activeSource === s.key && styles.sourceTabTextActive]}>
              {s.label}
            </Text>
          </Pressable>
        ))}
        <Pressable style={styles.sourceTab} onPress={() => webViewRef.current?.goBack()}>
          <Text style={styles.sourceTabText}>←</Text>
        </Pressable>
        <Pressable
          style={[styles.sourceTab, styles.playPauseTab, contentPaused && styles.sourceTabActive]}
          onPress={toggleContentPlayback}>
          <Text
            style={[styles.sourceTabText, contentPaused && styles.sourceTabTextActive]}>
            {contentPaused ? '▶' : '⏸'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraPane: {
    overflow: 'hidden',
  },
  cameraIdle: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0a0a0a',
  },
  cameraIdleImage: {
    width: 84,
    height: 84,
    borderRadius: 20,
    marginBottom: 6,
  },
  cameraIdleTitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    fontWeight: '700',
  },
  cameraIdleHint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  libraryWrap: {
    flex: 1,
  },
  libraryEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 32,
    backgroundColor: '#0a0a0a',
  },
  libraryTitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
    fontWeight: '700',
  },
  libraryHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    textAlign: 'center',
  },
  importButton: {
    marginTop: 8,
    backgroundColor: '#e91e63',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 24,
  },
  importButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  changeVideoButton: {
    position: 'absolute',
    top: 10,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  changeVideoText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  contentPane: {
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
  cameraToggle: {
    position: 'absolute',
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  cameraToggleText: {
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
    bottom: 26,
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
  zoomControls: {
    position: 'absolute',
    left: 12,
    bottom: 26,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
  },
  zoomButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomButtonText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 17,
  },
  zoomValue: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  dragHandle: {
    position: 'absolute',
    bottom: 0,
    alignSelf: 'center',
    width: 90,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragHandleBar: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  sourceBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 8,
    paddingHorizontal: 12,
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderColor: '#333',
  },
  sourceTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: '#222',
  },
  playPauseTab: {
    minWidth: 44,
    alignItems: 'center',
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
