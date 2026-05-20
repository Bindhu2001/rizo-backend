import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { COLORS, SHADOWS, moderateScale } from './Theme';
import { useTheme } from './ThemeContext';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, addMonths } from 'date-fns';
import axios from 'axios';
import { ChevronRight, ChevronLeft } from 'lucide-react-native';
import { API_ENDPOINTS } from '../constants/Config';

const CalendarWidget = ({ userId }) => {
  const theme = useTheme();
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchEvents(currentDate);
  }, [userId, currentDate]);

  const fetchEvents = async (date) => {
    setLoading(true);
    try {
      const monthStr = format(date, 'yyyy-MM');
      const formData = new FormData();
      formData.append('user_id', userId);
      formData.append('month', monthStr);

      const resp = await axios.post(API_ENDPOINTS.UPCOMING_EVENTS, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      console.log('[Calendar] raw response:', JSON.stringify(resp.data).slice(0, 300));

      if (resp.status === 200) {
        const d = resp.data;
        let found = null;
        if (Array.isArray(d)) found = d;
        else if (d && Array.isArray(d.data)) found = d.data;
        else if (d && typeof d === 'object') {
          // Try every key that holds an array
          for (const key of Object.keys(d)) {
            if (Array.isArray(d[key]) && d[key].length >= 0) { found = d[key]; break; }
          }
        }
        if (found) setEvents(found);
      }
    } catch (e) {
      console.log('[Calendar] fetch error', e);
    } finally {
      setLoading(false);
    }
  };

  const handleNextMonth = () => {
    setCurrentDate(prev => addMonths(prev, 1));
  };

  const handlePrevMonth = () => {
    setCurrentDate(prev => addMonths(prev, -1));
  };

  const normStatus = (s) => {
    const v = (s || '').replace(/^\/+/, '').toUpperCase().trim();
    if (v === 'BIRTHDAY' || v === 'BDAY') return 'BIR';
    if (v === 'ANNIVERSARY' || v === 'JOINING' || v === 'WORK_ANNIVERSARY' || v === 'JOIN') return 'JOIN';
    if (v === 'HOLIDAY' || v === 'PUBLIC_HOLIDAY') return 'HO';
    if (v === 'WEEKOFF' || v === 'WEEK_OFF' || v === 'WEEK OFF' || v === 'OFF') return 'WO';
    return v;
  };

  const getDaysInMonth = () => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    const days = eachDayOfInterval({ start, end });
    const startDayOfWeek = getDay(start); // 0 = Sunday

    const prefixDays = Array(startDayOfWeek).fill(null);
    return [...prefixDays, ...days];
  };

  const days = getDaysInMonth();
  const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const getCellEvents = (day) => {
    if (!day) return [];
    const dayNumber = parseInt(format(day, 'd'), 10);
    const dayMonthName = format(day, 'MMMM');
    const dayMonthShort = format(day, 'MMM');
    const monthNum = parseInt(format(day, 'M'), 10);

    try {
      return events.filter(e => {
        if (!e) return false;
        const rawDate = e.date || e.event_date || e.birth_date || e.birthday_date || e.joining_date || e.anniversary_date;
        if (!rawDate) return false;

        const dm = String(rawDate).trim();

        if (dm.includes('-')) {
          const parts = dm.split('-');
          if (parts.length === 2) {
            const p0 = parts[0].trim();
            const p1 = parts[1].trim();
            // "Month-Day" e.g. "May-15"
            if (isNaN(parseInt(p0, 10))) {
              return (p0 === dayMonthName || p0 === dayMonthShort) && parseInt(p1, 10) === dayNumber;
            }
            // "Day-Month" e.g. "15-May"
            if (isNaN(parseInt(p1, 10))) {
              return (p1 === dayMonthName || p1 === dayMonthShort) && parseInt(p0, 10) === dayNumber;
            }
            // "MM-DD" e.g. "05-15"
            return parseInt(p0, 10) === monthNum && parseInt(p1, 10) === dayNumber;
          } else if (parts.length === 3) {
            // Try YYYY-MM-DD
            try {
              const a = parseInt(parts[0], 10), b = parseInt(parts[1], 10), c = parseInt(parts[2], 10);
              if (a > 31) {
                // YYYY-MM-DD
                return isSameDay(new Date(a, b - 1, c), day);
              } else if (c > 31) {
                // DD-MM-YYYY
                return isSameDay(new Date(c, b - 1, a), day);
              } else {
                // ambiguous — try both
                try { if (isSameDay(new Date(dm), day)) return true; } catch (_) {}
                return isSameDay(new Date(c, b - 1, a), day);
              }
            } catch (_) { return false; }
          }
        }

        if (dm.includes('/')) {
          const parts = dm.split('/');
          if (parts.length === 3) {
            const a = parseInt(parts[0], 10), b = parseInt(parts[1], 10), c = parseInt(parts[2], 10);
            if (a > 31) return isSameDay(new Date(a, b - 1, c), day); // YYYY/MM/DD
            if (c > 31) return isSameDay(new Date(c, b - 1, a), day); // DD/MM/YYYY
            // MM/DD/YYYY — ambiguous, try DD/MM first
            return isSameDay(new Date(c, b - 1, a), day) || isSameDay(new Date(c, a - 1, b), day);
          }
        }

        return parseInt(dm, 10) === dayNumber;
      });
    } catch (err) {
      console.error('[Calendar] Filter error', err);
      return [];
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.card }]}>
      <View style={styles.calendarHeader}>
        <TouchableOpacity onPress={handlePrevMonth} style={[styles.prevBtn, { backgroundColor: theme.cardSoft }]}>
          <ChevronLeft color={COLORS.primaryDeep} size={20} />
        </TouchableOpacity>
        <Text style={[styles.monthTitle, { color: theme.text }]}>{format(currentDate, 'MMMM yyyy')}</Text>
        <TouchableOpacity onPress={handleNextMonth} style={[styles.nextBtn, { backgroundColor: theme.cardSoft }]}>
          <ChevronRight color={COLORS.primaryDeep} size={20} />
        </TouchableOpacity>
      </View>
      
      <View style={styles.headerRow}>
        {weekDays.map((d, i) => (
          <Text key={i} style={[styles.weekDayText, { color: theme.textLight }]}>{d}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {days.map((day, idx) => {
          if (!day) return <View key={idx} style={styles.cell} />;
          
          const dayEvents = getCellEvents(day);
          const hasBir = dayEvents.some(e => normStatus(e.status || e.type || e.event_type) === 'BIR');
          const hasJoin = dayEvents.some(e => normStatus(e.status || e.type || e.event_type) === 'JOIN');
          const hasHol = dayEvents.some(e => normStatus(e.status || e.type || e.event_type) === 'HO');
          const hasWO = dayEvents.some(e => normStatus(e.status || e.type || e.event_type) === 'WO');
          const isToday = isSameDay(day, new Date());
          const isSelected = selectedEvent && isSameDay(day, selectedEvent.date);

          return (
            <TouchableOpacity
              key={idx}
              style={[
                styles.cell, 
                isToday && { backgroundColor: theme.isDark ? '#3B1E5C' : '#F3E5F5', borderRadius: 12 },
                isSelected && { borderWidth: 2, borderColor: COLORS.primaryDeep, borderRadius: 12 }
              ]}
              onPress={() => {
                setSelectedEvent({ date: day, events: dayEvents });
              }}
            >
              <Text style={[styles.dayText, { color: theme.text }, isToday && styles.todayText]}>
                {format(day, 'd')}
              </Text>
              
              <View style={styles.indicators}>
                {hasBir && <View style={[styles.dot, { backgroundColor: '#E91E63' }]} />}
                {hasJoin && <View style={[styles.dot, { backgroundColor: '#2196F3' }]} />}
                {hasHol && <View style={[styles.dot, { backgroundColor: '#FF9800' }]} />}
                {hasWO && <View style={[styles.dot, { backgroundColor: '#4CAF50' }]} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={[styles.legend, { borderTopColor: theme.divider }]}>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#E91E63' }]} /><Text style={[styles.legendText, { color: theme.textLight }]}>Birthday</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#2196F3' }]} /><Text style={[styles.legendText, { color: theme.textLight }]}>Anniv.</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#FF9800' }]} /><Text style={[styles.legendText, { color: theme.textLight }]}>Holiday</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#4CAF50' }]} /><Text style={[styles.legendText, { color: theme.textLight }]}>Week Off</Text></View>
      </View>

      <Modal visible={!!selectedEvent} transparent animationType="fade" statusBarTranslucent>
        <View style={[styles.modalOverlay, { backgroundColor: theme.modalOverlay }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalDate, { color: theme.text }]}>
              {selectedEvent ? format(selectedEvent.date, 'dd MMM yyyy') : ''}
            </Text>
            
            <ScrollView style={[styles.eventList, { backgroundColor: theme.cardSoft }]} showsVerticalScrollIndicator={true} indicatorStyle="black" contentContainerStyle={selectedEvent?.events.length === 0 && { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
              {selectedEvent?.events && selectedEvent.events.length > 0 ? (
                selectedEvent.events.map((e, idx) => {
                  const ns = normStatus(e.status || e.type || e.event_type);
                  const isBir = ns === 'BIR';
                  const isHol = ns === 'HO';
                  const isWO = ns === 'WO';
                  const dotColor = isBir ? '#E91E63' : isHol ? '#FF9800' : isWO ? '#4CAF50' : '#2196F3';
                  const typeText = e.type || (isBir ? 'Birthday' : isHol ? 'Holiday' : isWO ? 'Week Off' : 'Work Anniversary');
                  
                  return (
                    <View key={idx} style={[styles.eventRow, { backgroundColor: theme.cardSoft }]}>
                      <View style={[styles.eventDot, { backgroundColor: dotColor }]} />
                      <View style={{ flex: 1 }}>
                         <Text style={[styles.eventName, { color: theme.text }]} numberOfLines={2}>{e.name || e.employee_name || e.title || e.event_name || e.description || 'Unknown'}</Text>
                         <Text style={[styles.eventType, { color: theme.textLight }]}>{typeText}</Text>
                      </View>
                    </View>
                  );
                })
              ) : (
                <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 20 }}>
                  <Text style={{ color: theme.textLight, fontSize: moderateScale(14), fontWeight: '700' }}>No events scheduled for this day</Text>
                </View>
              )}
            </ScrollView>

            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: theme.border }]} onPress={() => setSelectedEvent(null)}>
              <Text style={[styles.closeBtnText, { color: theme.text }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 24, padding: 16, ...SHADOWS.light },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 16, position: 'relative', width: '100%' },
  monthTitle: { fontSize: moderateScale(18), fontWeight: '900', color: COLORS.text, textAlign: 'center' },
  prevBtn: { position: 'absolute', left: 0, padding: 8, backgroundColor: '#F9FAFB', borderRadius: 12, zIndex: 10 },
  nextBtn: { position: 'absolute', right: 0, padding: 8, backgroundColor: '#F9FAFB', borderRadius: 12, zIndex: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 },
  weekDayText: { fontSize: moderateScale(13), color: COLORS.textLight, fontWeight: '700', width: 40, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', height: 48, justifyContent: 'center', alignItems: 'center' },
  todayCell: { backgroundColor: '#F3E5F5', borderRadius: 12 },
  dayText: { fontSize: moderateScale(15), fontWeight: '600', color: COLORS.text },
  todayText: { color: COLORS.primaryDeep, fontWeight: '900' },
  indicators: { flexDirection: 'row', marginTop: 4, height: 5, justifyContent: 'center', alignItems: 'center' },
  dot: { width: 5, height: 5, borderRadius: 2.5, marginHorizontal: 1 },
  legend: { flexDirection: 'row', justifyContent: 'center', marginTop: 16, borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  legendText: { fontSize: moderateScale(12), color: COLORS.textLight, fontWeight: '600' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', backgroundColor: '#FFF', borderRadius: 24, padding: 24 },
  modalDate: { fontSize: moderateScale(18), fontWeight: '900', color: COLORS.text, marginBottom: 16, textAlign: 'center' },
  eventList: { marginBottom: 24, maxHeight: 300, minHeight: 60, backgroundColor: '#F9FAFB', borderRadius: 12 },
  eventRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, backgroundColor: '#F9FAFB', padding: 12, borderRadius: 12 },
  eventDot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  eventName: { fontSize: moderateScale(15), fontWeight: '800', color: COLORS.text },
  eventType: { fontSize: moderateScale(12), color: COLORS.textLight, fontWeight: '600', marginTop: 2 },
  closeBtn: { backgroundColor: '#E5E7EB', padding: 14, borderRadius: 16, alignItems: 'center' },
  closeBtnText: { color: COLORS.text, fontWeight: '800', fontSize: moderateScale(14) }
});

export default CalendarWidget;
