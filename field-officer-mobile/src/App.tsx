import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
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

import { assignmentValues, displayStatus, formSections, isFormComplete, isReportLocked } from "./domain";
import { colors } from "./theme";
import { deviceName, StoreProvider, useStore } from "./store";
import type { Assignment, DisplayStatus, FormField } from "./types";

type Tab = "Overview" | "Assignments" | "Inspections" | "Drafts" | "Sync";

const tabs: { label: Tab; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: "Overview", icon: "home-outline" },
  { label: "Assignments", icon: "folder-open-outline" },
  { label: "Inspections", icon: "clipboard-outline" },
  { label: "Drafts", icon: "document-text-outline" },
  { label: "Sync", icon: "sync-outline" },
];

function AppRoot() {
  const { hydrated, signedIn } = useStore();
  if (!hydrated) {
    return <View style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }
  return signedIn ? <FieldOfficerApp /> : <LoginScreen />;
}

function LoginScreen() {
  const { login } = useStore();
  const [email, setEmail] = useState("field.officer@demo.ng");
  const [password, setPassword] = useState("Field2024!");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    const ok = await login(email, password);
    if (!ok) setError("Invalid field officer email or password.");
    setBusy(false);
  };

  return (
    <SafeAreaView style={styles.loginSafe}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.loginWrap}>
        <View style={styles.brandMark}><Ionicons name="shield-checkmark" size={34} color={colors.white} /></View>
        <Text style={styles.loginBrand}>VERITAS</Text>
        <Text style={styles.loginAgency}>RURAL ELECTRIFICATION AGENCY</Text>
        <View style={styles.loginCard}>
          <Text style={styles.loginTitle}>Field Officer Sign In</Text>
          <Text style={styles.loginSubtitle}>Access assigned projects and complete secure field inspections.</Text>
          <FieldLabel label="Email address">
            <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={styles.input} />
          </FieldLabel>
          <FieldLabel label="Password">
            <TextInput value={password} onChangeText={setPassword} secureTextEntry style={styles.input} />
          </FieldLabel>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Pressable onPress={() => void submit()} disabled={busy} style={styles.primaryButton}>
            {busy ? <ActivityIndicator color={colors.white} /> : <><Ionicons name="log-in-outline" size={18} color={colors.white} /><Text style={styles.primaryButtonText}>Sign in securely</Text></>}
          </Pressable>
          <Text style={styles.demoHint}>Demo: field.officer@demo.ng · Field2024!</Text>
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
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.headerBrand}><View style={styles.headerLogo}><Ionicons name="shield-checkmark" size={18} color={colors.white} /></View><View><Text style={styles.headerTitle}>Veritas</Text><Text style={styles.headerSubtitle}>FIELD OFFICER</Text></View></View>
        <Pressable onPress={() => setShowProfile(true)} style={styles.avatar}><Text style={styles.avatarText}>AY</Text></Pressable>
      </View>
      <View style={styles.onlineBar}>
        <View style={[styles.onlineDot, !isOnline && styles.offlineDot]} />
        <Text style={[styles.onlineText, !isOnline && { color: colors.amber }]}>{isOnline ? "Online" : "Offline"}</Text>
      </View>
      <View style={styles.page}>
        {tab === "Overview" && <Overview onOpen={setSelected} onNavigate={setTab} />}
        {tab === "Assignments" && <AssignmentList mode="assignments" onOpen={setSelected} />}
        {tab === "Inspections" && <AssignmentList mode="inspections" onOpen={setSelected} />}
        {tab === "Drafts" && <AssignmentList mode="drafts" onOpen={setSelected} />}
        {tab === "Sync" && <SyncScreen />}
      </View>
      <View style={styles.tabBar}>
        {tabs.map((item) => {
          const active = item.label === tab;
          return <Pressable key={item.label} onPress={() => setTab(item.label)} style={styles.tab}><Ionicons name={item.icon} size={21} color={active ? colors.primary : colors.slate} /><Text style={[styles.tabText, active && styles.tabTextActive]}>{item.label}</Text></Pressable>;
        })}
      </View>
      <InspectionModal assignment={selected} onClose={() => setSelected(null)} />
      <Modal visible={showProfile} transparent animationType="fade" onRequestClose={() => setShowProfile(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowProfile(false)}><Pressable style={styles.profileCard} onPress={() => undefined}><View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>AY</Text></View><Text style={styles.profileName}>{officerName}</Text><Text style={styles.profileRole}>Field Officer · Supreme Way</Text><View style={styles.profileRow}><Ionicons name="phone-portrait-outline" size={18} color={colors.primary} /><Text style={styles.profileValue}>{deviceName()}</Text></View><Pressable onPress={() => void logout()} style={styles.logoutButton}><Ionicons name="log-out-outline" size={18} color={colors.red} /><Text style={styles.logoutText}>Sign out</Text></Pressable></Pressable></Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Overview({ onOpen, onNavigate }: { onOpen: (item: Assignment) => void; onNavigate: (tab: Tab) => void }) {
  const { assignments } = useStore();
  const active = assignments.filter((item) => ["Assigned", "Draft", "Re-inspection"].includes(item.status));
  const drafts = assignments.filter((item) => displayStatus(item.status) === "Draft");
  const queued = assignments.filter((item) => item.syncStatus !== "synced");
  const approved = assignments.filter((item) => item.status === "Approved");
  const next = active[0];
  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.greeting}>Good day, Amina</Text>
      <Text style={styles.pageSubtitle}>Navigate, verify arrival and complete secure field inspections.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metricsRow}>
        <Metric label="Assigned Projects" value={active.length} note="Assigned or draft" icon="folder-open-outline" tone="green" onPress={() => onNavigate("Assignments")} />
        <Metric label="Inspections Due" value={active.length} note="Visits requiring action" icon="time-outline" tone="amber" onPress={() => onNavigate("Inspections")} />
        <Metric label="Approved" value={approved.length} note="Passed consultant QA" icon="checkmark-circle-outline" tone="green" onPress={() => onNavigate("Inspections")} />
        <Metric label="Draft Reports" value={drafts.length} note="Saved on this device" icon="document-text-outline" tone="blue" onPress={() => onNavigate("Drafts")} />
        <Metric label="Sync Pending" value={queued.length} note="Uploads when online" icon="cloud-upload-outline" tone="amber" onPress={() => onNavigate("Sync")} />
      </ScrollView>
      {next ? <View style={styles.nextCard}><View style={styles.sectionHead}><View><Text style={styles.eyebrow}>NEXT ASSIGNMENT</Text><Text style={styles.cardTitle}>{next.projectName}</Text></View><StatusBadge status={displayStatus(next.status)} /></View><View style={styles.locationRow}><Ionicons name="location-outline" size={17} color={colors.primary} /><Text style={styles.locationText}>{next.community}, {next.lga}, {next.state}</Text></View><View style={styles.metaRow}><Meta label="Programme" value={next.programme} /><Meta label="Component" value={next.component} /><Meta label="Due" value={formatDate(next.dueDate)} /></View><View style={styles.actionRow}><Pressable style={styles.outlineButton} onPress={() => openMaps(next)}><Ionicons name="navigate-outline" size={17} color={colors.primary} /><Text style={styles.outlineButtonText}>Navigate</Text></Pressable><Pressable style={[styles.primaryButton, styles.flexButton]} onPress={() => onOpen(next)}><Ionicons name="clipboard-outline" size={17} color={colors.white} /><Text style={styles.primaryButtonText}>{next.status === "Draft" ? "Continue" : "Open assignment"}</Text></Pressable></View></View> : null}
      <View style={styles.sectionHead}><View><Text style={styles.sectionTitle}>My Project Assignments</Text><Text style={styles.sectionSubtitle}>Projects requiring your attention</Text></View><Pressable onPress={() => onNavigate("Assignments")}><Text style={styles.viewAll}>View all</Text></Pressable></View>
      {active.slice(0, 4).map((item) => <AssignmentCard key={item.id} item={item} onOpen={onOpen} />)}
    </ScrollView>
  );
}

function AssignmentList({ mode, onOpen }: { mode: "assignments" | "inspections" | "drafts"; onOpen: (item: Assignment) => void }) {
  const { assignments } = useStore();
  const [state, setState] = useState("All");
  const [status, setStatus] = useState<DisplayStatus | "All">("All");
  const states = ["All", ...new Set(assignments.map((item) => item.state))];
  const base = assignments.filter((item) => {
    if (mode === "drafts") return displayStatus(item.status) === "Draft";
    if (mode === "assignments") return ["Assigned", "Draft", "Re-inspection"].includes(item.status);
    return true;
  });
  const filtered = base.filter((item) => (state === "All" || item.state === state) && (status === "All" || displayStatus(item.status) === status));
  const title = mode === "drafts" ? "Draft Reports" : mode === "assignments" ? "My Assignments" : "My Inspections";
  return (
    <FlatList data={filtered} keyExtractor={(item) => item.id} contentContainerStyle={styles.scrollContent} ListHeaderComponent={<><Text style={styles.pageTitle}>{title}</Text><Text style={styles.pageSubtitle}>{mode === "drafts" ? "Forms automatically saved on this device" : "Only projects assigned to your account"}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>{states.map((item) => <FilterChip key={item} label={item === "All" ? "All states" : item} active={state === item} onPress={() => setState(item)} />)}</ScrollView>{mode !== "drafts" ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>{(["All", "Assigned", "Draft", "Approved", "Verified"] as const).map((item) => <FilterChip key={item} label={item === "All" ? "All statuses" : item} active={status === item} onPress={() => setStatus(item)} />)}</ScrollView> : null}</>} renderItem={({ item }) => <AssignmentCard item={item} onOpen={onOpen} />} ListEmptyComponent={<EmptyState icon="document-outline" title="Nothing here" text="No field-officer records match this view." />} />
  );
}

function SyncScreen() {
  const { assignments, isOnline, syncNow } = useStore();
  const queued = assignments.filter((item) => item.syncStatus !== "synced");
  const completed = assignments.filter((item) => item.syncStatus === "synced");
  const [busy, setBusy] = useState(false);
  const sync = async () => { setBusy(true); await syncNow(); setBusy(false); };
  return <ScrollView contentContainerStyle={styles.scrollContent}><Text style={styles.pageTitle}>Offline Sync Queue</Text><Text style={styles.pageSubtitle}>Inspection packages upload sequentially when a connection is available.</Text><View style={styles.syncSummary}><MetricMini label="Uploading" value={busy ? 1 : 0} icon="cloud-upload-outline" color={colors.blue} /><MetricMini label="Waiting" value={queued.length} icon="time-outline" color={colors.amber} /><MetricMini label="Completed" value={completed.length} icon="checkmark-circle-outline" color={colors.primary} /></View><Pressable disabled={!isOnline || !queued.length || busy} onPress={() => void sync()} style={[styles.primaryButton, (!isOnline || !queued.length || busy) && styles.disabled]}>{busy ? <ActivityIndicator color={colors.white} /> : <><Ionicons name="sync" size={18} color={colors.white} /><Text style={styles.primaryButtonText}>{isOnline ? "Synchronize now" : "Waiting for internet"}</Text></>}</Pressable><View style={styles.queueCard}>{queued.length ? queued.map((item, index) => <View key={item.id} style={styles.queueRow}><View style={styles.queueIndex}><Text style={styles.queueIndexText}>{index + 1}</Text></View><View style={styles.queueInfo}><Text style={styles.queueTitle}>{item.projectName}</Text><Text style={styles.queueMeta}>{item.id} · {item.report?.evidence.length ?? 0} evidence files</Text></View><Text style={styles.queueState}>{item.syncStatus}</Text></View>) : <EmptyState icon="checkmark-done-circle-outline" title="Everything is synchronized" text="There are no inspection packages waiting to upload." />}</View><Text style={styles.securityNote}>GPS coordinates, timestamps, evidence and signatories remain attached to each inspection package until upload completes.</Text></ScrollView>;
}

function InspectionModal({ assignment, onClose }: { assignment: Assignment | null; onClose: () => void }) {
  const { assignments, verifyArrival, saveDraft, addEvidence, submitReport } = useStore();
  const live = assignment ? assignments.find((item) => item.id === assignment.id) ?? assignment : null;
  const [values, setValues] = useState<Record<string, string>>({});
  const [communitySignatory, setCommunitySignatory] = useState("");
  const [contractorSignatory, setContractorSignatory] = useState("");
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsMessage, setGpsMessage] = useState("");
  const [sectionIndex, setSectionIndex] = useState(0);
  const locked = live ? isReportLocked(live.status) : false;
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
    if (!live || locked || !Object.keys(values).length) return;
    const timer = setTimeout(() => saveDraft(live.id, values, communitySignatory, contractorSignatory), 700);
    return () => clearTimeout(timer);
  }, [values, communitySignatory, contractorSignatory, live?.id, locked, saveDraft]);

  if (!live) return null;

  const checkGps = async () => {
    setGpsBusy(true);
    const result = await verifyArrival(live.id);
    setGpsMessage(result.ok ? `Arrival verified · ${Math.round(result.distanceMetres)} m from project centre.` : result.message);
    setGpsBusy(false);
  };
  const captureEvidence = async () => {
    if (!live.arrival) return Alert.alert("GPS required", "Verify arrival before capturing evidence.");
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert("Camera permission required");
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (result.canceled) return;
    const current = await Location.getLastKnownPositionAsync();
    addEvidence(live.id, {
      id: `${Date.now()}`,
      uri: result.assets[0]?.uri ?? "",
      type: "photo",
      capturedAt: new Date().toISOString(),
      latitude: current?.coords.latitude ?? live.arrival.latitude,
      longitude: current?.coords.longitude ?? live.arrival.longitude,
      projectId: live.id,
      inspector: live.officer,
      deviceName: deviceName(),
    });
  };
  const submit = () => {
    saveDraft(live.id, values, communitySignatory, contractorSignatory);
    if (!isFormComplete(live.component, values)) return Alert.alert("Incomplete form", "Complete every required field before submission.");
    const result = submitReport(live.id, values, communitySignatory, contractorSignatory);
    Alert.alert(result.ok ? "Submitted" : "Submission blocked", result.message, result.ok ? [{ text: "Done", onPress: onClose }] : undefined);
  };
  const section = sections[sectionIndex];
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}><View style={styles.modalHeader}><Pressable onPress={onClose} style={styles.iconButton}><Ionicons name="close" size={24} color={colors.deep} /></Pressable><View style={styles.modalTitleWrap}><Text numberOfLines={1} style={styles.modalTitle}>{live.projectName}</Text><Text style={styles.modalSubtitle}>{live.id} · {live.component}</Text></View><StatusBadge status={displayStatus(live.status)} /></View><ScrollView contentContainerStyle={styles.inspectionContent} keyboardShouldPersistTaps="handled"><View style={styles.gpsCard}><View style={styles.gpsIcon}><Ionicons name={live.arrival ? "shield-checkmark" : "location"} size={24} color={live.arrival ? colors.primary : colors.amber} /></View><View style={styles.gpsCopy}><Text style={styles.gpsTitle}>{live.arrival ? "Arrival verified" : "GPS verification required"}</Text><Text style={styles.gpsText}>{live.arrival ? `${Math.round(live.arrival.distanceMetres)} m from approved project centre` : "You must be within 250 m before data collection."}</Text></View></View>{gpsMessage ? <Text style={[styles.gpsMessage, gpsMessage.startsWith("Verification blocked") && styles.gpsError]}>{gpsMessage}</Text> : null}<View style={styles.actionRow}><Pressable style={styles.outlineButton} onPress={() => openMaps(live)}><Ionicons name="navigate-outline" size={17} color={colors.primary} /><Text style={styles.outlineButtonText}>Open Maps</Text></Pressable><Pressable disabled={gpsBusy || locked} style={[styles.primaryButton, styles.flexButton, (gpsBusy || locked) && styles.disabled]} onPress={() => void checkGps()}>{gpsBusy ? <ActivityIndicator color={colors.white} /> : <><Ionicons name="locate-outline" size={17} color={colors.white} /><Text style={styles.primaryButtonText}>Verify GPS</Text></>}</Pressable></View><View style={styles.stepRow}>{sections.map((item, index) => <Pressable key={item.title} onPress={() => setSectionIndex(index)} style={[styles.step, index === sectionIndex && styles.stepActive]}><Text style={[styles.stepText, index === sectionIndex && styles.stepTextActive]}>{index + 1}</Text></Pressable>)}</View>{section ? <View style={styles.formCard}><Text style={styles.formTitle}>{section.title}</Text>{section.fields.map((field) => <FormInput key={field.key} field={field} value={values[field.key] ?? ""} locked={locked || Boolean(field.assigned)} onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))} />)}</View> : null}<View style={styles.actionRow}>{sectionIndex > 0 ? <Pressable style={styles.outlineButton} onPress={() => setSectionIndex((current) => current - 1)}><Text style={styles.outlineButtonText}>Previous</Text></Pressable> : <View />}{sectionIndex < sections.length - 1 ? <Pressable style={[styles.primaryButton, styles.flexButton]} onPress={() => setSectionIndex((current) => current + 1)}><Text style={styles.primaryButtonText}>Next section</Text><Ionicons name="arrow-forward" size={16} color={colors.white} /></Pressable> : null}</View><View style={styles.formCard}><Text style={styles.formTitle}>Photo evidence</Text><Text style={styles.sectionSubtitle}>Photos are stamped with project ID, GPS, time, inspector and device.</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.evidenceRow}>{live.report?.evidence.map((item) => <View key={item.id} style={styles.evidenceItem}><Image source={{ uri: item.uri }} style={styles.evidenceImage} /><View style={styles.evidenceStamp}><Text style={styles.evidenceStampText}>{live.id}</Text><Text style={styles.evidenceStampText}>{new Date(item.capturedAt).toLocaleString()}</Text></View></View>)}{!locked ? <Pressable onPress={() => void captureEvidence()} style={styles.captureButton}><Ionicons name="camera-outline" size={27} color={colors.primary} /><Text style={styles.captureText}>Capture</Text></Pressable> : null}</ScrollView></View><View style={styles.formCard}><Text style={styles.formTitle}>Representative signatories</Text><FormInput field={{ key: "communitySignatory", label: "Community representative" }} value={communitySignatory} locked={locked} onChange={setCommunitySignatory} /><FormInput field={{ key: "contractorSignatory", label: "Contractor representative" }} value={contractorSignatory} locked={locked} onChange={setContractorSignatory} /></View>{locked ? <View style={styles.lockedCard}><Ionicons name="lock-closed" size={18} color={colors.primary} /><Text style={styles.lockedText}>This submitted inspection is locked and cannot be modified.</Text></View> : <View style={styles.submitRow}><Pressable style={styles.outlineButton} onPress={() => { saveDraft(live.id, values, communitySignatory, contractorSignatory); Alert.alert("Draft saved", "This inspection is stored on the device."); }}><Ionicons name="save-outline" size={17} color={colors.primary} /><Text style={styles.outlineButtonText}>Save draft</Text></Pressable><Pressable style={[styles.primaryButton, styles.flexButton]} onPress={submit}><Ionicons name="send-outline" size={17} color={colors.white} /><Text style={styles.primaryButtonText}>Submit for review</Text></Pressable></View>}</ScrollView></SafeAreaView>
    </Modal>
  );
}

function FormInput({ field, value, locked, onChange }: { field: FormField; value: string; locked: boolean; onChange: (value: string) => void }) {
  return <FieldLabel label={field.label}>{field.options ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>{field.options.map((option) => <FilterChip key={option} label={option} active={value === option} disabled={locked} onPress={() => onChange(option)} />)}</ScrollView> : <TextInput editable={!locked} value={value} onChangeText={onChange} keyboardType={field.keyboard ?? "default"} style={[styles.input, locked && styles.readonlyInput]} placeholder={locked ? "" : `Enter ${field.label.toLowerCase()}`} placeholderTextColor="#a0aaa4" />}</FieldLabel>;
}

function AssignmentCard({ item, onOpen }: { item: Assignment; onOpen: (item: Assignment) => void }) {
  const status = displayStatus(item.status);
  return <Pressable onPress={() => onOpen(item)} style={styles.assignmentCard}><View style={styles.assignmentTop}><View style={styles.projectIcon}><Ionicons name={item.component === "Grid Extension" ? "git-network-outline" : item.component === "Mini Grid" ? "sunny-outline" : "battery-charging-outline"} size={21} color={colors.primary} /></View><View style={styles.assignmentMain}><Text style={styles.assignmentName}>{item.projectName}</Text><Text style={styles.assignmentId}>{item.id} · {item.programme}</Text></View><StatusBadge status={status} /></View><View style={styles.locationRow}><Ionicons name="location-outline" size={15} color={colors.muted} /><Text style={styles.assignmentLocation}>{item.community}, {item.lga}, {item.state}</Text></View><View style={styles.assignmentFooter}><Text style={styles.dueText}>Due {formatDate(item.dueDate)}</Text><View style={styles.openLink}><Text style={styles.openLinkText}>{isReportLocked(item.status) ? "View report" : item.status === "Draft" ? "Continue" : "Open"}</Text><Ionicons name="chevron-forward" size={16} color={colors.primary} /></View></View></Pressable>;
}

function Metric({ label, value, note, icon, tone, onPress }: { label: string; value: number; note: string; icon: keyof typeof Ionicons.glyphMap; tone: "green" | "amber" | "blue"; onPress: () => void }) {
  const color = tone === "amber" ? colors.amber : tone === "blue" ? colors.blue : colors.primary;
  const pale = tone === "amber" ? colors.amberPale : tone === "blue" ? colors.bluePale : colors.paleStrong;
  return <Pressable onPress={onPress} style={styles.metricCard}><View style={[styles.metricIcon, { backgroundColor: pale }]}><Ionicons name={icon} size={20} color={color} /></View><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricNote}>{note}</Text><View style={[styles.metricLine, { backgroundColor: color }]} /></Pressable>;
}

function MetricMini({ label, value, icon, color }: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap; color: string }) {
  return <View style={styles.metricMini}><Ionicons name={icon} size={20} color={color} /><Text style={styles.metricMiniValue}>{value}</Text><Text style={styles.metricMiniLabel}>{label}</Text></View>;
}

function StatusBadge({ status }: { status: DisplayStatus }) {
  const tone = status === "Verified" || status === "Approved" ? colors.primary : status === "Draft" ? colors.blue : colors.amber;
  const background = status === "Verified" || status === "Approved" ? colors.paleStrong : status === "Draft" ? colors.bluePale : colors.amberPale;
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

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  safe: { flex: 1, backgroundColor: colors.background },
  page: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 28, gap: 12 },
  header: { height: 62, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerBrand: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerLogo: { width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  headerTitle: { color: colors.deep, fontSize: 18, lineHeight: 19, fontWeight: "800", letterSpacing: 0.2 },
  headerSubtitle: { color: colors.primary, fontSize: 8, fontWeight: "800", letterSpacing: 1.3 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.paleStrong, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  onlineBar: { height: 30, paddingHorizontal: 16, backgroundColor: colors.white, flexDirection: "row", alignItems: "center", gap: 7 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primaryBright },
  offlineDot: { backgroundColor: colors.amber },
  onlineText: { color: colors.primary, fontSize: 11, fontWeight: "700" },
  greeting: { fontSize: 22, color: colors.deep, fontWeight: "800" },
  pageTitle: { fontSize: 21, color: colors.deep, fontWeight: "800" },
  pageSubtitle: { marginTop: -7, color: colors.muted, fontSize: 12, lineHeight: 18 },
  metricsRow: { gap: 10, paddingVertical: 3 },
  metricCard: { width: 148, height: 142, borderRadius: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: "#e1ebe4", padding: 13, overflow: "hidden" },
  metricIcon: { width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  metricValue: { marginTop: 8, color: colors.deep, fontSize: 24, fontWeight: "800" },
  metricLabel: { color: colors.deep, fontSize: 11, fontWeight: "800" },
  metricNote: { color: colors.muted, fontSize: 9, marginTop: 3 },
  metricLine: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  nextCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 15, gap: 12 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 4 },
  eyebrow: { color: colors.primary, fontSize: 9, letterSpacing: 1.3, fontWeight: "800", marginBottom: 4 },
  cardTitle: { maxWidth: 235, fontSize: 15, lineHeight: 20, color: colors.deep, fontWeight: "800" },
  sectionTitle: { color: colors.deep, fontSize: 15, fontWeight: "800" },
  sectionSubtitle: { color: colors.muted, fontSize: 10, marginTop: 3, lineHeight: 15 },
  viewAll: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  locationText: { color: colors.deep, fontSize: 12, flex: 1 },
  metaRow: { flexDirection: "row", paddingVertical: 9, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#edf1ee" },
  meta: { flex: 1 },
  metaLabel: { color: colors.muted, fontSize: 8, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" },
  metaValue: { marginTop: 3, color: colors.deep, fontSize: 11, fontWeight: "700" },
  actionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 9 },
  primaryButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 8, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  primaryButtonText: { color: colors.white, fontSize: 12, fontWeight: "800" },
  flexButton: { flex: 1 },
  outlineButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: "#8bcba0", flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
  outlineButtonText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  disabled: { opacity: 0.45 },
  assignmentCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: "#e1ebe4", borderRadius: 13, padding: 13, gap: 10 },
  assignmentTop: { flexDirection: "row", alignItems: "center", gap: 9 },
  projectIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.paleStrong, alignItems: "center", justifyContent: "center" },
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
  tabBar: { height: 68, paddingTop: 8, paddingBottom: 6, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row" },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  tabText: { color: colors.slate, fontSize: 8, fontWeight: "700" },
  tabTextActive: { color: colors.primary },
  empty: { padding: 36, alignItems: "center", justifyContent: "center" },
  emptyTitle: { marginTop: 9, color: colors.deep, fontSize: 14, fontWeight: "800" },
  emptyText: { marginTop: 5, color: colors.muted, textAlign: "center", fontSize: 11, lineHeight: 17 },
  syncSummary: { flexDirection: "row", gap: 8 },
  metricMini: { flex: 1, alignItems: "center", backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: "#e1ebe4", paddingVertical: 13 },
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
  field: { marginTop: 8 },
  fieldLabel: { color: colors.muted, fontSize: 9, textTransform: "uppercase", letterSpacing: 0.55, fontWeight: "800", marginBottom: 6 },
  input: { height: 44, borderWidth: 1, borderColor: "#dbe5df", borderRadius: 8, backgroundColor: colors.white, paddingHorizontal: 12, color: colors.deep, fontSize: 12 },
  readonlyInput: { backgroundColor: "#f4f7f5", color: colors.muted },
  optionRow: { gap: 6 },
  evidenceRow: { gap: 9, paddingTop: 9 },
  evidenceItem: { width: 170, height: 132, borderRadius: 10, overflow: "hidden", backgroundColor: colors.pale },
  evidenceImage: { width: "100%", height: "100%" },
  evidenceStamp: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(8,61,35,0.78)", padding: 6 },
  evidenceStampText: { color: colors.white, fontSize: 7, fontWeight: "700" },
  captureButton: { width: 108, height: 132, borderRadius: 10, borderWidth: 1, borderStyle: "dashed", borderColor: "#8bcba0", backgroundColor: colors.pale, alignItems: "center", justifyContent: "center", gap: 5 },
  captureText: { color: colors.primary, fontSize: 10, fontWeight: "800" },
  lockedCard: { flexDirection: "row", alignItems: "center", gap: 9, padding: 12, backgroundColor: colors.paleStrong, borderRadius: 9 },
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
  brandMark: { width: 66, height: 66, borderRadius: 18, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
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
