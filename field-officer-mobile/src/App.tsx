import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { assignmentValues, assignmentsForSection, displayStatus, formSections, isFormComplete, isReportLocked } from "./domain";
import { colors } from "./theme";
import { deviceName, StoreProvider, useStore } from "./store";
import { deviceAudit, networkAudit, sha256File, timezone } from "./audit";
import type { Assignment, DisplayStatus, FormField } from "./types";

type Tab = "Overview" | "Assignments" | "Inspections" | "Drafts" | "Sync";

const tabs: { label: Tab; icon: keyof typeof Ionicons.glyphMap; color: string; pale: string }[] = [
  { label: "Overview", icon: "apps-outline", color: colors.primary, pale: colors.paleStrong },
  { label: "Assignments", icon: "briefcase-outline", color: colors.blue, pale: colors.bluePale },
  { label: "Inspections", icon: "shield-checkmark-outline", color: colors.violet, pale: colors.violetPale },
  { label: "Drafts", icon: "document-text-outline", color: colors.amber, pale: colors.amberPale },
  { label: "Sync", icon: "cloud-upload-outline", color: colors.cyan, pale: colors.cyanPale },
];
const reaLogo = require("../assets/rea-logo.png");

async function persistEvidence(uri: string, type: "photo" | "video") {
  if (!FileSystem.documentDirectory) return uri;
  const directory = `${FileSystem.documentDirectory}inspection-evidence/`;
  const extension = uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)?.[1] ?? (type === "video" ? "mp4" : "jpg");
  const destination = `${directory}${type}-${Date.now()}.${extension}`;
  try {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    await FileSystem.copyAsync({ from: uri, to: destination });
    return destination;
  } catch {
    return uri;
  }
}

function AppRoot() {
  const { hydrated, signedIn } = useStore();
  if (!hydrated) {
    return <View style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }
  return signedIn ? <FieldOfficerApp /> : <LoginScreen />;
}

function LoginScreen() {
  const { login } = useStore();
  const [identifier, setIdentifier] = useState("08093822087");
  const [password, setPassword] = useState("siddiqa12");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    const ok = await login(identifier, password);
    if (!ok) setError("Invalid field officer phone/email or password.");
    setBusy(false);
  };

  return (
    <SafeAreaView style={styles.loginSafe}>
      <StatusBar hidden />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.loginWrap}>
        <Image source={reaLogo} style={styles.brandMark} resizeMode="contain" />
        <Text style={styles.loginBrand}>VERITAS</Text>
        <Text style={styles.loginAgency}>RURAL ELECTRIFICATION AGENCY</Text>
        <View style={styles.loginCard}>
          <Text style={styles.loginTitle}>Field Officer Sign In</Text>
          <Text style={styles.loginSubtitle}>Access assigned projects and complete secure field inspections.</Text>
          <FieldLabel label="Phone number or email">
            <TextInput value={identifier} onChangeText={setIdentifier} autoCapitalize="none" keyboardType="default" style={styles.input} />
          </FieldLabel>
          <FieldLabel label="Password">
            <TextInput value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} style={styles.input} />
          </FieldLabel>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Pressable onPress={() => void submit()} disabled={busy} style={styles.primaryButton}>
            {busy ? <ActivityIndicator color={colors.white} /> : <><Ionicons name="log-in-outline" size={18} color={colors.white} /><Text style={styles.primaryButtonText}>Sign in securely</Text></>}
          </Pressable>
          <Text style={styles.demoHint}>Mustapha: 08093822087 · siddiqa12{"\n"}Amina: field.officer@demo.ng · Field2024!</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FieldOfficerApp() {
  const { officerName, isOnline, logout } = useStore();
  const [tab, setTab] = useState<Tab>("Overview");
  const [selected, setSelected] = useState<Assignment | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar hidden />
      <View style={styles.header}>
        <View style={styles.headerBrand}><Image source={reaLogo} style={styles.headerLogo} resizeMode="contain" /><View><Text style={styles.headerTitle}>Veritas</Text><Text style={styles.headerSubtitle}>REA · FIELD OFFICER</Text></View></View>
        <View style={styles.headerActions}>
          <View style={styles.onlinePill}><View style={[styles.onlineDot, !isOnline && styles.offlineDot]} /><Text style={[styles.onlineText, !isOnline && { color: colors.amber }]}>{isOnline ? "ONLINE" : "OFFLINE"}</Text></View>
          <Pressable onPress={() => setShowProfile(true)} style={styles.avatar}><Text style={styles.avatarText}>{initials(officerName)}</Text></Pressable>
        </View>
      </View>
      <View style={styles.page}>
        {tab === "Overview" && <Overview onOpen={setSelected} onNavigate={setTab} />}
        {tab === "Assignments" && <AssignmentList mode="assignments" onOpen={setSelected} />}
        {tab === "Inspections" && <AssignmentList mode="inspections" onOpen={setSelected} />}
        {tab === "Drafts" && <AssignmentList mode="drafts" onOpen={setSelected} />}
        {tab === "Sync" && <SyncScreen />}
      </View>
      <View style={styles.tabBar}>
        {tabs.map((item) => <AnimatedTab key={item.label} item={item} active={item.label === tab} onPress={() => setTab(item.label)} />)}
      </View>
      <InspectionModal assignment={selected} onClose={() => setSelected(null)} />
      <Modal visible={showProfile} transparent animationType="fade" onRequestClose={() => setShowProfile(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowProfile(false)}><Pressable style={styles.profileCard} onPress={() => undefined}><View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>{initials(officerName)}</Text></View><Text style={styles.profileName}>{officerName}</Text><Text style={styles.profileRole}>Field Officer · Supreme Way</Text><View style={styles.profileRow}><Ionicons name="phone-portrait-outline" size={18} color={colors.primary} /><Text style={styles.profileValue}>{deviceName()}</Text></View><Pressable onPress={() => void logout()} style={styles.logoutButton}><Ionicons name="log-out-outline" size={18} color={colors.red} /><Text style={styles.logoutText}>Sign out</Text></Pressable></Pressable></Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function AnimatedTab({ item, active, onPress }: { item: (typeof tabs)[number]; active: boolean; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) return;
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.12, useNativeDriver: true, speed: 28, bounciness: 7 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 5 }),
    ]).start();
  }, [active, scale]);
  return (
    <Pressable onPress={onPress} onPressIn={() => Animated.spring(scale, { toValue: 0.9, useNativeDriver: true }).start()} onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()} style={[styles.tab, active && { backgroundColor: item.pale }]}>
      <Animated.View style={[styles.tabIcon, { backgroundColor: active ? item.color : item.pale, transform: [{ scale }] }]}><Ionicons name={item.icon} size={19} color={active ? colors.white : item.color} /></Animated.View>
      <Text style={[styles.tabText, active && { color: item.color }]}>{item.label}</Text>
    </Pressable>
  );
}

function Overview({ onOpen, onNavigate }: { onOpen: (item: Assignment) => void; onNavigate: (tab: Tab) => void }) {
  const { assignments, officerName, consultantFirm } = useStore();
  const assigned = assignments.filter((item) => item.status === "Assigned");
  const drafts = assignments.filter((item) => item.status === "Draft");
  const dueSoon = assignments.filter((item) => ["Assigned", "Draft"].includes(item.status) && new Date(item.dueDate).getTime() <= Date.now() + 7 * 86_400_000);
  const toSync = assignments.filter((item) => item.syncStatus !== "synced");
  const recentInspections = assignments
    .filter((item) => ["Submitted", "Approved", "Verified"].includes(item.status))
    .slice(0, 3);
  const next = drafts[0] ?? assigned[0];
  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.heroCopy}>
        <Text style={styles.greeting}>Good day, {officerName.split(" ")[0]}</Text>
        <Text style={styles.consultantName}>{consultantFirm}</Text>
        <Text style={styles.pageSubtitle}>Your field work at a glance.</Text>
      </View>
      <View style={styles.metricsRow}>
        <Metric label="Assigned" value={assigned.length} note="Ready to start" icon="briefcase-outline" tone="green" onPress={() => onNavigate("Assignments")} />
        <Metric label="Due Soon" value={dueSoon.length} note="Within 7 days" icon="time-outline" tone="amber" onPress={() => onNavigate("Assignments")} />
        <Metric label="Drafts" value={drafts.length} note="Autosaved forms" icon="document-text-outline" tone="blue" onPress={() => onNavigate("Drafts")} />
        <Metric label="To Sync" value={toSync.length} note="Waiting upload" icon="cloud-upload-outline" tone="violet" onPress={() => onNavigate("Sync")} />
      </View>
      {next ? <View style={styles.nextCard}><View style={styles.assignmentTop}><View style={styles.projectIcon}><Ionicons name="flash-outline" size={21} color={colors.primary} /></View><View style={styles.assignmentMain}><Text style={styles.eyebrow}>CURRENT ASSIGNMENT</Text><Text style={styles.cardTitle}>{next.projectName}</Text></View></View><View style={styles.locationRow}><Ionicons name="location-outline" size={17} color={colors.primary} /><Text style={styles.locationText}>{next.community}, {next.state} · {next.id}</Text></View><Pressable style={styles.outlineButton} onPress={() => openMaps(next)}><Ionicons name="navigate-outline" size={17} color={colors.primary} /><Text style={styles.outlineButtonText}>Navigate to site</Text></Pressable><Pressable style={styles.primaryButton} onPress={() => onOpen(next)}><Text style={styles.primaryButtonText}>{next.status === "Draft" ? "Continue inspection" : "Start inspection"}</Text><Ionicons name="arrow-forward" size={17} color={colors.white} /></Pressable></View> : null}
      <View style={styles.listPanel}><View style={styles.sectionHead}><Text style={styles.sectionTitle}>Recent Inspections</Text><Pressable onPress={() => onNavigate("Inspections")} style={styles.viewAllButton}><Text style={styles.viewAll}>See all</Text><Ionicons name="arrow-forward" size={15} color={colors.primary} /></Pressable></View>{recentInspections.length ? recentInspections.map((item) => <AssignmentCard key={item.id} item={item} onOpen={onOpen} compact />) : <EmptyState icon="shield-checkmark-outline" title="No recent inspections" text="Submitted inspections will appear here." />}</View>
    </ScrollView>
  );
}

function AssignmentList({ mode, onOpen }: { mode: "assignments" | "inspections" | "drafts"; onOpen: (item: Assignment) => void }) {
  const { assignments } = useStore();
  const base = assignmentsForSection(assignments, mode);
  const title = mode === "drafts" ? "Drafts" : mode === "assignments" ? "Assignments" : "Inspections";
  const subtitle = mode === "drafts" ? "Forms you started are autosaved here" : mode === "assignments" ? "Projects ready for field inspection" : "Submitted and reviewed field inspections";
  const summaries = mode === "assignments"
    ? [
        { label: "Assigned", value: base.length, icon: "folder-open-outline" as const, tone: "green" as const },
        { label: "Due this week", value: base.filter((item) => new Date(item.dueDate).getTime() <= Date.now() + 7 * 86_400_000).length, icon: "calendar-outline" as const, tone: "amber" as const },
        { label: "States", value: new Set(base.map((item) => item.state)).size, icon: "map-outline" as const, tone: "blue" as const },
      ]
    : mode === "drafts"
      ? [
          { label: "Autosaved", value: base.length, icon: "cloud-done-outline" as const, tone: "green" as const },
          { label: "With evidence", value: base.filter((item) => (item.report?.evidence.length ?? 0) > 0).length, icon: "camera-outline" as const, tone: "blue" as const },
          { label: "To complete", value: base.length, icon: "create-outline" as const, tone: "amber" as const },
        ]
      : [
          { label: "Submitted", value: base.filter((item) => item.status === "Submitted").length, icon: "paper-plane-outline" as const, tone: "blue" as const },
          { label: "Approved", value: base.filter((item) => item.status === "Approved").length, icon: "checkmark-circle-outline" as const, tone: "green" as const },
          { label: "Verified", value: base.filter((item) => item.status === "Verified").length, icon: "shield-checkmark-outline" as const, tone: "green" as const },
          { label: "Re-inspection", value: base.filter((item) => item.status === "Re-inspection").length, icon: "refresh-outline" as const, tone: "amber" as const },
        ];
  return (
    <FlatList data={base} keyExtractor={(item) => item.id} contentContainerStyle={styles.scrollContent} ListHeaderComponent={<><View style={styles.heroCopy}><Text style={styles.pageTitle}>{title}</Text><Text style={styles.pageSubtitle}>{subtitle}</Text></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.summaryStrip}>{summaries.map((item) => <SummaryCard key={item.label} {...item} />)}</ScrollView><Text style={styles.listLabel}>{mode === "drafts" ? "Autosaved forms" : mode === "assignments" ? "Assignment list" : "Inspection history"}</Text></>} renderItem={({ item }) => <AssignmentCard item={item} onOpen={onOpen} />} ListEmptyComponent={<EmptyState icon={mode === "drafts" ? "document-text-outline" : "checkmark-done-outline"} title={mode === "drafts" ? "No drafts" : "Nothing here"} text={mode === "drafts" ? "A form appears here automatically after you start filling it." : "No records are available in this section."} />} />
  );
}

function SyncScreen() {
  const { assignments, isOnline, syncNow } = useStore();
  const pending = assignments.filter((item) => item.syncStatus !== "synced");
  const waiting = assignments.filter((item) => item.syncStatus === "queued" || item.syncStatus === "failed");
  const uploading = assignments.filter((item) => item.syncStatus === "uploading");
  const completed = assignments.filter((item) => item.syncStatus === "synced");
  const [busy, setBusy] = useState(false);
  const sync = async () => { setBusy(true); await syncNow(); setBusy(false); };
  return <ScrollView contentContainerStyle={styles.scrollContent}><View style={styles.heroCopy}><Text style={styles.pageTitle}>Sync</Text><Text style={styles.pageSubtitle}>Uploads continue safely when an internet connection is available.</Text></View><View style={styles.syncSummary}><MetricMini label="Uploading" value={uploading.length || (busy ? 1 : 0)} icon="cloud-upload-outline" color={colors.blue} /><MetricMini label="Waiting" value={waiting.length} icon="time-outline" color={colors.amber} /><MetricMini label="Completed" value={completed.length} icon="checkmark-circle-outline" color={colors.primary} /></View><Pressable disabled={!isOnline || !pending.length || busy} onPress={() => void sync()} style={[styles.primaryButton, (!isOnline || !pending.length || busy) && styles.disabled]}>{busy ? <ActivityIndicator color={colors.white} /> : <><Ionicons name="sync" size={18} color={colors.white} /><Text style={styles.primaryButtonText}>{isOnline ? "Synchronize now" : "Waiting for internet"}</Text></>}</Pressable><Text style={styles.listLabel}>Waiting to upload</Text><View style={styles.queueCard}>{pending.length ? pending.map((item, index) => <View key={item.id} style={styles.queueRow}><View style={styles.queueIndex}><Text style={styles.queueIndexText}>{index + 1}</Text></View><View style={styles.queueInfo}><Text style={styles.queueTitle}>{item.projectName}</Text><Text style={styles.queueMeta}>{item.id} · {item.report?.evidence.length ?? 0} evidence files</Text></View><Text style={styles.queueState}>{item.syncStatus}</Text></View>) : <EmptyState icon="checkmark-done-circle-outline" title="Everything is synchronized" text="There are no inspection packages waiting to upload." />}</View><Text style={styles.securityNote}>GPS coordinates, timestamps, evidence and signatories stay attached to every inspection package.</Text></ScrollView>;
}

function InspectionModal({ assignment, onClose }: { assignment: Assignment | null; onClose: () => void }) {
  const { assignments, officerId, consultantFirm, sessionId, verifyArrival, saveDraft, addEvidence, submitReport } = useStore();
  const live = assignment ? assignments.find((item) => item.id === assignment.id) ?? assignment : null;
  const [values, setValues] = useState<Record<string, string>>({});
  const [communitySignatory, setCommunitySignatory] = useState("");
  const [contractorSignatory, setContractorSignatory] = useState("");
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsMessage, setGpsMessage] = useState("");
  const [sectionIndex, setSectionIndex] = useState(0);
  const workflowLocked = live ? isReportLocked(live.status) : false;
  const gpsLocked = Boolean(live && !live.arrival);
  const formLocked = workflowLocked || gpsLocked;
  const sections = live ? formSections[live.component] : [];

  useEffect(() => {
    if (!live) return;
    setValues(assignmentValues(live));
    setCommunitySignatory(live.report?.communitySignatory ?? "");
    setContractorSignatory(live.report?.contractorSignatory ?? "");
    setSectionIndex(0);
    setGpsMessage("");
  }, [live?.id]);

  useEffect(() => {
    if (!live || formLocked || !Object.keys(values).length) return;
    const timer = setTimeout(() => saveDraft(live.id, values, communitySignatory, contractorSignatory), 350);
    return () => clearTimeout(timer);
  }, [values, communitySignatory, contractorSignatory, live?.id, formLocked]);

  if (!live) return null;

  const checkGps = async () => {
    setGpsBusy(true);
    const result = await verifyArrival(live.id);
    setGpsMessage(result.ok ? `Arrival verified · ${Math.round(result.distanceMetres)} m from project centre.` : result.message);
    setGpsBusy(false);
  };
  const captureEvidence = async (type: "photo" | "video") => {
    if (!live.arrival) return Alert.alert("GPS required", "Verify arrival before capturing evidence.");
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert("Camera permission required");
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: [type === "video" ? "videos" : "images"],
      quality: 0.8,
      videoMaxDuration: 60,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return Alert.alert("Evidence unavailable", "The camera did not return a media file. Please try again.");
    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null);
    const uri = await persistEvidence(asset.uri, type);
    const capturedAt = new Date().toISOString();
    const [integrityHash, network, fileInfo] = await Promise.all([
      sha256File(uri).catch(() => ""),
      networkAudit(),
      FileSystem.getInfoAsync(uri),
    ]);
    if (!integrityHash) return Alert.alert("Evidence not saved", "The app could not create the evidence integrity hash. Please capture it again.");
    const evidenceResult = addEvidence(live.id, {
      id: `${live.id}-${Date.now()}`,
      uri,
      type,
      capturedAt,
      latitude: current?.coords.latitude ?? live.arrival.latitude,
      longitude: current?.coords.longitude ?? live.arrival.longitude,
      projectId: live.projectId ?? live.id,
      inspector: live.officer,
      deviceName: deviceName(),
      assignmentId: live.id,
      programme: live.programme,
      component: live.component,
      contractor: live.contractor,
      officerId,
      consultantFirm,
      sessionId,
      timezone: timezone(),
      gpsAccuracyMetres: current?.coords.accuracy ?? live.arrival.accuracyMetres,
      altitudeMetres: current?.coords.altitude ?? live.arrival.altitudeMetres,
      headingDegrees: current?.coords.heading ?? live.arrival.headingDegrees,
      speedMetresPerSecond: current?.coords.speed ?? live.arrival.speedMetresPerSecond,
      mocked: current?.mocked ?? live.arrival.mocked,
      captureSequence: (live.report?.evidence.length ?? 0) + 1,
      durationSeconds: type === "video" && asset.duration ? asset.duration / 1000 : null,
      fileSizeBytes: asset.fileSize ?? (fileInfo.exists && "size" in fileInfo ? fileInfo.size : null),
      integrityAlgorithm: "SHA-256",
      integrityHash,
      ...network,
      device: deviceAudit(),
    });
    if (!evidenceResult.ok) Alert.alert("Evidence not saved", evidenceResult.message);
  };
  const submit = async () => {
    if (!live.arrival) return Alert.alert("GPS required", "Verify arrival before filling or submitting the form.");
    if (!isFormComplete(live.component, values)) return Alert.alert("Incomplete form", "Complete every required field before submission.");
    const result = await submitReport(live.id, values, communitySignatory, contractorSignatory);
    Alert.alert(result.ok ? "Submitted" : "Submission blocked", result.message, result.ok ? [{ text: "Done", onPress: onClose }] : undefined);
  };
  const section = sections[sectionIndex];
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}><StatusBar hidden /><View style={styles.modalHeader}><Pressable onPress={onClose} style={styles.iconButton}><Ionicons name="close" size={24} color={colors.deep} /></Pressable><View style={styles.modalTitleWrap}><Text numberOfLines={1} style={styles.modalTitle}>{live.projectName}</Text><Text style={styles.modalSubtitle}>{live.id} · {live.component}</Text></View><StatusBadge status={displayStatus(live.status)} /></View><ScrollView contentContainerStyle={styles.inspectionContent} keyboardShouldPersistTaps="handled"><View style={styles.gpsCard}><View style={styles.gpsIcon}><Ionicons name={live.arrival ? "shield-checkmark" : "location"} size={24} color={live.arrival ? colors.primary : colors.amber} /></View><View style={styles.gpsCopy}><Text style={styles.gpsTitle}>{live.arrival ? "Arrival verified" : "GPS verification required"}</Text><Text style={styles.gpsText}>{live.arrival ? `${Math.round(live.arrival.distanceMetres)} m from approved project centre${live.arrival.accuracyMetres ? ` · ±${Math.round(live.arrival.accuracyMetres)} m accuracy` : ""}` : "The form stays locked until you are verified within 250 m."}</Text></View></View>{gpsMessage ? <Text style={[styles.gpsMessage, gpsMessage.startsWith("Verification blocked") && styles.gpsError]}>{gpsMessage}</Text> : null}<View style={styles.actionRow}><Pressable style={styles.outlineButton} onPress={() => openMaps(live)}><Ionicons name="navigate-outline" size={17} color={colors.primary} /><Text style={styles.outlineButtonText}>Open Maps</Text></Pressable><Pressable disabled={gpsBusy || workflowLocked} style={[styles.primaryButton, styles.flexButton, (gpsBusy || workflowLocked) && styles.disabled]} onPress={() => void checkGps()}>{gpsBusy ? <ActivityIndicator color={colors.white} /> : <><Ionicons name="locate-outline" size={17} color={colors.white} /><Text style={styles.primaryButtonText}>Verify GPS</Text></>}</Pressable></View>{gpsLocked ? <View style={[styles.lockedCard, styles.gpsLockedCard]}><Ionicons name="lock-closed" size={18} color={colors.amber} /><Text style={[styles.lockedText, { color: colors.amber }]}>Data entry, evidence and autosave unlock after GPS verification.</Text></View> : null}<View style={styles.stepRow}>{sections.map((item, index) => <Pressable key={item.title} onPress={() => setSectionIndex(index)} style={[styles.step, index === sectionIndex && styles.stepActive]}><Text style={[styles.stepText, index === sectionIndex && styles.stepTextActive]}>{index + 1}</Text></Pressable>)}</View>{section ? <View style={styles.formCard}><Text style={styles.formTitle}>{section.title}</Text>{section.fields.map((field, index) => <View key={field.key}>{field.group && section.fields[index - 1]?.group !== field.group ? <Text style={styles.fieldGroup}>{field.group}</Text> : null}<FormInput field={field} value={values[field.key] ?? ""} locked={formLocked || Boolean(field.assigned)} onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))} /></View>)}</View> : null}<View style={styles.actionRow}>{sectionIndex > 0 ? <Pressable style={styles.outlineButton} onPress={() => setSectionIndex((current) => current - 1)}><Text style={styles.outlineButtonText}>Previous</Text></Pressable> : <View />}{sectionIndex < sections.length - 1 ? <Pressable style={[styles.primaryButton, styles.flexButton]} onPress={() => setSectionIndex((current) => current + 1)}><Text style={styles.primaryButtonText}>Next section</Text><Ionicons name="arrow-forward" size={16} color={colors.white} /></Pressable> : null}</View><View style={styles.formCard}><Text style={styles.formTitle}>Evidence</Text><Text style={styles.sectionSubtitle}>Photos and videos carry project, GPS, time, officer, device, network and SHA-256 integrity metadata.</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.evidenceRow}>{live.report?.evidence.map((item) => <View key={item.id} style={styles.evidenceItem}>{item.type === "photo" ? <Image source={{ uri: item.uri }} style={styles.evidenceImage} /> : <View style={styles.videoEvidence}><Ionicons name="videocam" size={32} color={colors.white} /><Text style={styles.videoEvidenceText}>VIDEO EVIDENCE</Text></View>}<View style={styles.evidenceStamp}><Text style={styles.evidenceStampText}>{live.id} · {item.type.toUpperCase()}</Text><Text style={styles.evidenceStampText}>{new Date(item.capturedAt).toLocaleString()}</Text></View></View>)}{!formLocked ? <><Pressable onPress={() => void captureEvidence("photo")} style={styles.captureButton}><Ionicons name="camera-outline" size={27} color={colors.primary} /><Text style={styles.captureText}>Photo</Text></Pressable><Pressable onPress={() => void captureEvidence("video")} style={[styles.captureButton, styles.videoCaptureButton]}><Ionicons name="videocam-outline" size={27} color={colors.blue} /><Text style={[styles.captureText, { color: colors.blue }]}>Video</Text></Pressable></> : null}</ScrollView></View><View style={styles.formCard}><Text style={styles.formTitle}>Representative signatories</Text><FormInput field={{ key: "communitySignatory", label: "Community representative" }} value={communitySignatory} locked={formLocked} onChange={setCommunitySignatory} /><FormInput field={{ key: "contractorSignatory", label: "Contractor representative" }} value={contractorSignatory} locked={formLocked} onChange={setContractorSignatory} /></View>{workflowLocked ? <View style={styles.lockedCard}><Ionicons name="lock-closed" size={18} color={colors.primary} /><Text style={styles.lockedText}>This submitted inspection is locked and cannot be modified.</Text></View> : <View style={styles.submitRow}><Pressable disabled={gpsLocked} style={[styles.outlineButton, gpsLocked && styles.disabled]} onPress={() => { const result = saveDraft(live.id, values, communitySignatory, contractorSignatory); Alert.alert(result.ok ? "Draft saved" : "Draft locked", result.message); }}><Ionicons name="save-outline" size={17} color={colors.primary} /><Text style={styles.outlineButtonText}>Save draft</Text></Pressable><Pressable disabled={gpsLocked} style={[styles.primaryButton, styles.flexButton, gpsLocked && styles.disabled]} onPress={() => void submit()}><Ionicons name="send-outline" size={17} color={colors.white} /><Text style={styles.primaryButtonText}>Submit for review</Text></Pressable></View>}</ScrollView></SafeAreaView>
    </Modal>
  );
}

function FormInput({ field, value, locked, onChange }: { field: FormField; value: string; locked: boolean; onChange: (value: string) => void }) {
  return <FieldLabel label={field.label}>{field.options ? <View style={[styles.pickerWrap, locked && styles.readonlyInput]}><Picker selectedValue={value} enabled={!locked} onValueChange={(next) => onChange(String(next))} style={styles.picker} dropdownIconColor={colors.primary}><Picker.Item label={`Select ${field.label.toLowerCase()}`} value="" color={colors.slate} />{field.options.map((option) => <Picker.Item key={option} label={option} value={option} />)}</Picker></View> : <TextInput editable={!locked} value={value} onChangeText={onChange} keyboardType={field.keyboard ?? "default"} style={[styles.input, locked && styles.readonlyInput]} placeholder={locked ? "" : `Enter ${field.label.toLowerCase()}`} placeholderTextColor="#a0aaa4" />}</FieldLabel>;
}

function AssignmentCard({ item, onOpen, compact = false }: { item: Assignment; onOpen: (item: Assignment) => void; compact?: boolean }) {
  const status = displayStatus(item.status);
  return <Pressable onPress={() => onOpen(item)} style={[styles.assignmentCard, compact && styles.assignmentCardCompact]}><View style={styles.assignmentTop}><View style={styles.projectIcon}><Ionicons name="sunny-outline" size={20} color={colors.primary} /></View><View style={styles.assignmentMain}><Text style={styles.assignmentName}>{item.projectName}</Text><Text style={styles.assignmentId}>{item.id} · {item.component}</Text></View>{compact ? <Text style={styles.dueText}>{formatDate(item.dueDate)}</Text> : <StatusBadge status={status} />}<Ionicons name="chevron-forward" size={17} color={colors.slate} /></View>{compact ? null : <><View style={styles.locationRow}><Ionicons name="location-outline" size={15} color={colors.muted} /><Text style={styles.assignmentLocation}>{item.community}, {item.lga}, {item.state}</Text></View><View style={styles.assignmentFooter}><Text style={styles.dueText}>Due {formatDate(item.dueDate)}</Text><Text style={styles.openLinkText}>{isReportLocked(item.status) ? "View report" : item.status === "Draft" ? "Continue form" : item.status === "Re-inspection" ? "Start again" : "Open"}</Text></View></>}</Pressable>;
}

function Metric({ label, value, note, icon, tone, onPress }: { label: string; value: number; note: string; icon: keyof typeof Ionicons.glyphMap; tone: "green" | "amber" | "blue" | "violet"; onPress: () => void }) {
  const color = tone === "amber" ? colors.amber : tone === "blue" ? colors.blue : tone === "violet" ? colors.violet : colors.primary;
  const pale = tone === "amber" ? colors.amberPale : tone === "blue" ? colors.bluePale : tone === "violet" ? colors.violetPale : colors.paleStrong;
  return <Pressable onPress={onPress} style={[styles.metricCard, { backgroundColor: pale }]}><View style={[styles.metricIcon, { backgroundColor: "rgba(255,255,255,0.66)" }]}><Ionicons name={icon} size={20} color={color} /></View><Text style={styles.metricValue}>{String(value).padStart(2, "0")}</Text><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricNote}>{note}</Text><View style={[styles.metricLine, { backgroundColor: color }]} /></Pressable>;
}

function SummaryCard({ label, value, icon, tone }: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap; tone: "green" | "amber" | "blue" }) {
  const color = tone === "amber" ? colors.amber : tone === "blue" ? colors.blue : colors.primary;
  const pale = tone === "amber" ? colors.amberPale : tone === "blue" ? colors.bluePale : colors.paleStrong;
  return <View style={[styles.summaryCard, { backgroundColor: pale }]}><Ionicons name={icon} size={20} color={color} /><Text style={styles.summaryValue}>{String(value).padStart(2, "0")}</Text><Text style={styles.summaryLabel}>{label}</Text></View>;
}

function MetricMini({ label, value, icon, color }: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap; color: string }) {
  return <View style={styles.metricMini}><Ionicons name={icon} size={20} color={color} /><Text style={styles.metricMiniValue}>{value}</Text><Text style={styles.metricMiniLabel}>{label}</Text></View>;
}

function StatusBadge({ status }: { status: DisplayStatus }) {
  const tone = status === "Verified" || status === "Approved" ? colors.primary : status === "Draft" || status === "Submitted" ? colors.blue : colors.amber;
  const background = status === "Verified" || status === "Approved" ? colors.paleStrong : status === "Draft" || status === "Submitted" ? colors.bluePale : colors.amberPale;
  return <View style={[styles.badge, { backgroundColor: background }]}><View style={[styles.badgeDot, { backgroundColor: tone }]} /><Text style={[styles.badgeText, { color: tone }]}>{status}</Text></View>;
}

function FilterChip({ label, active, disabled = false, onPress }: { label: string; active: boolean; disabled?: boolean; onPress: () => void }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.chip, active && styles.chipActive, disabled && styles.disabled]}><Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text></Pressable>;
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text>{children}</View>;
}

function Meta({ label, value }: { label: string; value: string }) {
  return <View style={styles.meta}><Text style={styles.metaLabel}>{label}</Text><Text style={styles.metaValue}>{value}</Text></View>;
}

function EmptyState({ icon, title, text }: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }) {
  return <View style={styles.empty}><Ionicons name={icon} size={36} color={colors.slate} /><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyText}>{text}</Text></View>;
}

function openMaps(item: Assignment) {
  void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${item.latitude},${item.longitude}`);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  safe: { flex: 1, backgroundColor: colors.background },
  page: { flex: 1 },
  scrollContent: { padding: 18, paddingBottom: 28, gap: 14 },
  header: { height: 70, backgroundColor: "rgba(255,255,255,0.94)", borderBottomWidth: 1, borderBottomColor: "rgba(223,233,226,0.75)", paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerBrand: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerLogo: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.white },
  headerTitle: { color: colors.deep, fontSize: 17, lineHeight: 18, fontWeight: "800", letterSpacing: 0.2 },
  headerSubtitle: { color: colors.primary, fontSize: 8, fontWeight: "800", letterSpacing: 1.3 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  onlinePill: { flexDirection: "row", alignItems: "center", gap: 5 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.paleStrong, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  onlineBar: { height: 30, paddingHorizontal: 16, backgroundColor: colors.white, flexDirection: "row", alignItems: "center", gap: 7 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primaryBright },
  offlineDot: { backgroundColor: colors.amber },
  onlineText: { color: colors.primary, fontSize: 8, fontWeight: "900", letterSpacing: 1.4 },
  heroCopy: { marginTop: 18, marginBottom: 10 },
  greeting: { fontSize: 28, lineHeight: 34, color: colors.deep, fontWeight: "800", letterSpacing: -0.8 },
  pageTitle: { fontSize: 28, lineHeight: 34, color: colors.deep, fontWeight: "800", letterSpacing: -0.7 },
  consultantName: { color: colors.primary, fontSize: 13, lineHeight: 19, fontWeight: "800", marginTop: 5 },
  pageSubtitle: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  metricsRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metricCard: { width: "48%", flexGrow: 1, minWidth: 140, height: 150, borderRadius: 24, padding: 14, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  metricIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  metricValue: { marginTop: 8, color: colors.deep, fontSize: 23, fontWeight: "800", letterSpacing: -0.5 },
  metricLabel: { color: colors.muted, fontSize: 9, fontWeight: "700", textAlign: "center" },
  metricNote: { color: colors.muted, fontSize: 8, marginTop: 4, textAlign: "center" },
  metricLine: { position: "absolute", left: 15, right: 15, bottom: 10, height: 3, borderRadius: 2 },
  nextCard: { backgroundColor: "rgba(255,255,255,0.94)", borderRadius: 24, padding: 17, gap: 12, shadowColor: "#214C38", shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 4, overflow: "hidden" },
  listPanel: { backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 24, padding: 15, gap: 9, shadowColor: "#214C38", shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 4 },
  eyebrow: { color: colors.primary, fontSize: 9, letterSpacing: 1.3, fontWeight: "800", marginBottom: 4 },
  cardTitle: { maxWidth: 235, fontSize: 15, lineHeight: 20, color: colors.deep, fontWeight: "800" },
  sectionTitle: { color: colors.deep, fontSize: 14, fontWeight: "800" },
  sectionSubtitle: { color: colors.muted, fontSize: 10, marginTop: 3, lineHeight: 15 },
  viewAllButton: { flexDirection: "row", alignItems: "center", gap: 4 },
  viewAll: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  listLabel: { color: colors.deep, fontSize: 13, fontWeight: "800", marginTop: 5 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  locationText: { color: colors.deep, fontSize: 12, flex: 1 },
  metaRow: { flexDirection: "row", paddingVertical: 9, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#edf1ee" },
  meta: { flex: 1 },
  metaLabel: { color: colors.muted, fontSize: 8, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" },
  metaValue: { marginTop: 3, color: colors.deep, fontSize: 11, fontWeight: "700" },
  actionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 9 },
  primaryButton: { minHeight: 46, paddingHorizontal: 16, borderRadius: 14, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  primaryButtonText: { color: colors.white, fontSize: 12, fontWeight: "800" },
  flexButton: { flex: 1 },
  outlineButton: { minHeight: 46, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: "#B9D7C4", flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.82)" },
  outlineButtonText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  disabled: { opacity: 0.45 },
  assignmentCard: { backgroundColor: "rgba(255,255,255,0.94)", borderWidth: 1, borderColor: "rgba(223,233,226,0.9)", borderRadius: 18, padding: 14, gap: 10, marginBottom: 2 },
  assignmentCardCompact: { borderRadius: 15, paddingVertical: 10, paddingHorizontal: 11, shadowColor: "#214C38", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  assignmentTop: { flexDirection: "row", alignItems: "center", gap: 9 },
  projectIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.paleStrong, alignItems: "center", justifyContent: "center" },
  assignmentMain: { flex: 1 },
  assignmentName: { color: colors.deep, fontSize: 13, lineHeight: 17, fontWeight: "800" },
  assignmentId: { color: colors.muted, fontSize: 9, marginTop: 3 },
  assignmentLocation: { color: colors.muted, fontSize: 11, flex: 1 },
  assignmentFooter: { borderTopWidth: 1, borderColor: "#edf1ee", paddingTop: 9, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dueText: { color: colors.muted, fontSize: 10, fontWeight: "600" },
  openLink: { flexDirection: "row", alignItems: "center", gap: 2 },
  openLinkText: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  badge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, height: 25, borderRadius: 13 },
  badgeDot: { width: 5, height: 5, borderRadius: 3 },
  badgeText: { fontSize: 9, fontWeight: "800" },
  chipRow: { gap: 7, paddingVertical: 2 },
  chip: { borderWidth: 1, borderColor: "#dbe5df", backgroundColor: colors.white, paddingHorizontal: 12, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.paleStrong },
  chipText: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  chipTextActive: { color: colors.primary },
  tabBar: { height: 70, marginHorizontal: 14, marginBottom: 10, padding: 7, backgroundColor: "rgba(255,255,255,0.96)", borderWidth: 1, borderColor: "rgba(255,255,255,0.9)", borderRadius: 25, flexDirection: "row", shadowColor: "#173B2A", shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 7 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3, borderRadius: 18 },
  tabIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  tabActive: { backgroundColor: colors.paleStrong },
  tabText: { color: colors.slate, fontSize: 8, fontWeight: "700" },
  tabTextActive: { color: colors.primary },
  empty: { padding: 36, alignItems: "center", justifyContent: "center" },
  emptyTitle: { marginTop: 9, color: colors.deep, fontSize: 14, fontWeight: "800" },
  emptyText: { marginTop: 5, color: colors.muted, textAlign: "center", fontSize: 11, lineHeight: 17 },
  summaryStrip: { gap: 9, paddingVertical: 2 },
  summaryCard: { width: 112, height: 122, borderRadius: 21, padding: 14, justifyContent: "center" },
  summaryValue: { color: colors.deep, fontSize: 23, fontWeight: "800", marginTop: 8 },
  summaryLabel: { color: colors.muted, fontSize: 9, fontWeight: "700", marginTop: 2 },
  syncSummary: { flexDirection: "row", gap: 8 },
  metricMini: { flex: 1, alignItems: "center", backgroundColor: "rgba(255,255,255,0.94)", borderRadius: 20, paddingVertical: 15 },
  metricMiniValue: { color: colors.deep, fontSize: 20, fontWeight: "800", marginTop: 4 },
  metricMiniLabel: { color: colors.muted, fontSize: 9, fontWeight: "700", marginTop: 2 },
  queueCard: { backgroundColor: colors.white, borderRadius: 13, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  queueRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 13, borderBottomWidth: 1, borderBottomColor: "#edf1ee" },
  queueIndex: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.amberPale, alignItems: "center", justifyContent: "center" },
  queueIndexText: { color: colors.amber, fontSize: 10, fontWeight: "800" },
  queueInfo: { flex: 1 },
  queueTitle: { color: colors.deep, fontSize: 11, fontWeight: "800" },
  queueMeta: { color: colors.muted, fontSize: 8, marginTop: 3 },
  queueState: { color: colors.amber, fontSize: 9, fontWeight: "800", textTransform: "capitalize" },
  securityNote: { backgroundColor: colors.pale, borderRadius: 9, padding: 12, color: colors.muted, fontSize: 9, lineHeight: 15 },
  modalHeader: { height: 64, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: colors.white },
  iconButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.pale },
  modalTitleWrap: { flex: 1 },
  modalTitle: { color: colors.deep, fontSize: 13, fontWeight: "800" },
  modalSubtitle: { color: colors.muted, fontSize: 8, marginTop: 3 },
  inspectionContent: { padding: 15, paddingBottom: 40, gap: 12 },
  gpsCard: { flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 13 },
  gpsIcon: { width: 42, height: 42, borderRadius: 11, backgroundColor: colors.paleStrong, alignItems: "center", justifyContent: "center" },
  gpsCopy: { flex: 1 },
  gpsTitle: { color: colors.deep, fontSize: 13, fontWeight: "800" },
  gpsText: { color: colors.muted, fontSize: 9, marginTop: 4 },
  gpsMessage: { padding: 10, borderRadius: 8, color: colors.primary, backgroundColor: colors.paleStrong, fontSize: 10, fontWeight: "800" },
  gpsError: { color: colors.red, backgroundColor: colors.redPale },
  stepRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginVertical: 2 },
  step: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#e7ede9", alignItems: "center", justifyContent: "center" },
  stepActive: { backgroundColor: colors.primary },
  stepText: { color: colors.muted, fontSize: 10, fontWeight: "800" },
  stepTextActive: { color: colors.white },
  formCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 14, gap: 2 },
  formTitle: { color: colors.deep, fontSize: 14, fontWeight: "800", marginBottom: 8 },
  fieldGroup: { marginTop: 13, marginBottom: 1, color: colors.primary, fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.5 },
  field: { marginTop: 8 },
  fieldLabel: { color: colors.muted, fontSize: 9, textTransform: "uppercase", letterSpacing: 0.55, fontWeight: "800", marginBottom: 6 },
  input: { height: 44, borderWidth: 1, borderColor: "#dbe5df", borderRadius: 8, backgroundColor: colors.white, paddingHorizontal: 12, color: colors.deep, fontSize: 12 },
  pickerWrap: { height: 48, borderWidth: 1, borderColor: "#dbe5df", borderRadius: 8, backgroundColor: colors.white, justifyContent: "center", overflow: "hidden" },
  picker: { color: colors.deep, fontSize: 12 },
  readonlyInput: { backgroundColor: "#f4f7f5", color: colors.muted },
  optionRow: { gap: 6 },
  evidenceRow: { gap: 9, paddingTop: 9 },
  evidenceItem: { width: 170, height: 132, borderRadius: 10, overflow: "hidden", backgroundColor: colors.pale },
  evidenceImage: { width: "100%", height: "100%" },
  evidenceStamp: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(8,61,35,0.78)", padding: 6 },
  evidenceStampText: { color: colors.white, fontSize: 7, fontWeight: "700" },
  captureButton: { width: 108, height: 132, borderRadius: 10, borderWidth: 1, borderStyle: "dashed", borderColor: "#8bcba0", backgroundColor: colors.pale, alignItems: "center", justifyContent: "center", gap: 5 },
  videoCaptureButton: { borderColor: "#91abd0", backgroundColor: colors.bluePale },
  captureText: { color: colors.primary, fontSize: 10, fontWeight: "800" },
  videoEvidence: { width: "100%", height: "100%", backgroundColor: colors.deep, alignItems: "center", justifyContent: "center", gap: 6 },
  videoEvidenceText: { color: colors.white, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  lockedCard: { flexDirection: "row", alignItems: "center", gap: 9, padding: 12, backgroundColor: colors.paleStrong, borderRadius: 9 },
  gpsLockedCard: { backgroundColor: colors.amberPale },
  lockedText: { flex: 1, color: colors.primary, fontSize: 10, fontWeight: "700" },
  submitRow: { flexDirection: "row", gap: 9 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(10,25,17,0.42)", justifyContent: "flex-start", alignItems: "flex-end", paddingTop: 72, paddingRight: 15 },
  profileCard: { width: 270, borderRadius: 14, backgroundColor: colors.white, padding: 18, alignItems: "center" },
  profileAvatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  profileAvatarText: { color: colors.white, fontWeight: "800", fontSize: 17 },
  profileName: { color: colors.deep, fontSize: 16, fontWeight: "800", marginTop: 10 },
  profileRole: { color: colors.muted, fontSize: 10, marginTop: 3 },
  profileRow: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16, paddingVertical: 11, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#edf1ee" },
  profileValue: { color: colors.deep, fontSize: 11, flex: 1 },
  logoutButton: { alignSelf: "stretch", height: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 13, borderRadius: 8, backgroundColor: colors.redPale },
  logoutText: { color: colors.red, fontSize: 11, fontWeight: "800" },
  loginSafe: { flex: 1, backgroundColor: colors.pale },
  loginWrap: { flex: 1, paddingHorizontal: 22, justifyContent: "center", alignItems: "center" },
  brandMark: { width: 92, height: 92, borderRadius: 46, backgroundColor: colors.white },
  loginBrand: { color: colors.deep, fontSize: 25, fontWeight: "900", letterSpacing: 3, marginTop: 14 },
  loginAgency: { color: colors.primary, fontSize: 8, fontWeight: "800", letterSpacing: 1.2, marginTop: 3 },
  loginCard: { alignSelf: "stretch", marginTop: 28, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 18 },
  loginTitle: { color: colors.deep, fontSize: 19, fontWeight: "800" },
  loginSubtitle: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 5, marginBottom: 8 },
  errorText: { color: colors.red, fontSize: 10, fontWeight: "700", marginVertical: 8 },
  demoHint: { color: colors.muted, textAlign: "center", fontSize: 8, marginTop: 12 },
});

export default function App() {
  return <StoreProvider><AppRoot /></StoreProvider>;
}
