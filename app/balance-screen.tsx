import { addToWorkerBalance } from '@/src/services/workerService';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

const { width, height } = Dimensions.get('window');

interface PaymentMethod {
  id: string;
  name: string;
  icon: string;
  enabled: boolean;
  description: string;
}

interface BalanceResponse {
  message: string;
  newBalance: number;
  addedAmount: number;
}

export default function BalanceScreen() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const paymentMethods: PaymentMethod[] = [
    {
      id: 'wafacash',
      name: 'Wafacash',
      icon: 'smartphone',
      enabled: true,
      description: 'Payer via Wafacash',
    },
    {
      id: 'cashplus',
      name: 'Cash Plus',
      icon: 'credit-card',
      enabled: true,
      description: 'Payer via Cash Plus',
    },
    {
      id: 'creditcard',
      name: 'Carte de crédit',
      icon: 'credit-card',
      enabled: false,
      description: 'Bientôt disponible',
    },
  ];

  const handleMethodSelect = (method: PaymentMethod) => {
    if (!method.enabled) {
      return;
    }
    setSelectedMethod(method);
    setCurrentStep(2);
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      router.back();
    }
  };

  const handleSubmit = async () => {
    if (!selectedMethod || !referenceNumber.trim() || !amount.trim()) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }

    const amountNumber = parseFloat(amount);
    if (isNaN(amountNumber) || amountNumber <= 0) {
      Alert.alert('Erreur', 'Veuillez entrer un montant valide');
      return;
    }

    Alert.alert(
      'Confirmation',
      `Paiement de ${amount} DH via ${selectedMethod.name} avec référence ${referenceNumber}`,
      [
        { text: 'Annuler', style: 'cancel' },
        { 
          text: 'Confirmer', 
          onPress: async () => {
            try {
              setIsLoading(true);
              
              // Call the balance API
              const response: BalanceResponse = await addToWorkerBalance(amountNumber);
              
              console.log('Balance added successfully:', response);
              
              Alert.alert(
                'Succès',
                `Solde mis à jour avec succès!\nNouveau solde: ${response.newBalance} DH\nMontant ajouté: ${response.addedAmount} DH`,
                [
                  {
                    text: 'OK',
                    onPress: () => {
                      router.back();
                    }
                  }
                ]
              );
            } catch (error: any) {
              console.error('Error adding balance:', error);
              Alert.alert(
                'Erreur',
                error?.response?.data?.message || 'Une erreur est survenue lors du paiement. Veuillez réessayer.'
              );
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  const renderStepIndicator = () => {
    return (
      <View style={styles.stepIndicator}>
        <View style={[styles.stepDot, currentStep >= 1 && styles.stepDotActive]} />
        <View style={[styles.stepLine, currentStep >= 2 && styles.stepLineActive]} />
        <View style={[styles.stepDot, currentStep >= 2 && styles.stepDotActive]} />
      </View>
    );
  };

  const renderStep1 = () => {
    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>Choisissez votre méthode de paiement</Text>
        <Text style={styles.stepSubtitle}>Sélectionnez une option pour recharger votre solde</Text>
        
        <View style={styles.paymentMethods}>
          {paymentMethods.map((method) => (
            <TouchableOpacity
              key={method.id}
              style={[
                styles.paymentCard,
                !method.enabled && styles.paymentCardDisabled,
                selectedMethod?.id === method.id && styles.paymentCardSelected,
              ]}
              onPress={() => handleMethodSelect(method)}
              disabled={!method.enabled}
            >
              <View style={styles.paymentCardHeader}>
                <View style={styles.paymentIcon}>
                  <Feather 
                    name={method.icon as any} 
                    size={24} 
                    color={method.enabled ? '#3b82f6' : '#9ca3af'} 
                  />
                </View>
                <View style={styles.paymentInfo}>
                  <Text style={[
                    styles.paymentName,
                    !method.enabled && styles.paymentNameDisabled
                  ]}>
                    {method.name}
                  </Text>
                  <Text style={[
                    styles.paymentDescription,
                    !method.enabled && styles.paymentDescriptionDisabled
                  ]}>
                    {method.description}
                  </Text>
                </View>
                {!method.enabled && (
                  <View style={styles.disabledBadge}>
                    <Text style={styles.disabledBadgeText}>Bientôt</Text>
                  </View>
                )}
                {method.enabled && selectedMethod?.id === method.id && (
                  <View style={styles.selectedBadge}>
                    <Feather name="check" size={16} color="#fff" />
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const renderStep2 = () => {
    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>Entrez les informations de paiement</Text>
        <Text style={styles.stepSubtitle}>
          Remplissez les détails pour votre paiement via {selectedMethod?.name}
        </Text>
        
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Montant (DH)</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              placeholder="Entrez le montant"
              keyboardType="numeric"
              placeholderTextColor="#9ca3af"
            />
          </View>
          
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Numéro de référence</Text>
            <TextInput
              style={styles.input}
              value={referenceNumber}
              onChangeText={setReferenceNumber}
              placeholder="Entrez le numéro de référence"
              placeholderTextColor="#9ca3af"
            />
          </View>
          
          <View style={styles.infoCard}>
            <Feather name="info" size={20} color="#3b82f6" />
            <Text style={styles.infoText}>
              Après avoir effectué le paiement via {selectedMethod?.name}, 
              entrez le numéro de référence pour valider le rechargement.
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Feather name="arrow-left" size={24} color="#1a1a2e" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Recharger le solde</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Step Indicator */}
      {renderStepIndicator()}

      {/* Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
      </ScrollView>

      {/* Bottom Action */}
      <View style={styles.bottomActions}>
        {currentStep === 2 && (
          <>
            <TouchableOpacity 
              style={styles.backButtonAction} 
              onPress={() => setCurrentStep(1)}
            >
              <Text style={styles.backButtonText}>Retour</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
                  style={[styles.submitButton, isLoading && styles.submitButtonDisabled]} 
                  onPress={handleSubmit}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Feather name="check" size={20} color="#fff" />
                  )}
                  <Text style={styles.submitButtonText}>
                    {isLoading ? 'Traitement en cours...' : 'Confirmer le paiement'}
                  </Text>
                </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  placeholder: {
    width: 40,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: '#fff',
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#e5e7eb',
  },
  stepDotActive: {
    backgroundColor: '#3b82f6',
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 8,
  },
  stepLineActive: {
    backgroundColor: '#3b82f6',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  stepContent: {
    paddingTop: 20,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 8,
    textAlign: 'center',
  },
  stepSubtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  paymentMethods: {
    gap: 16,
  },
  paymentCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  paymentCardDisabled: {
    opacity: 0.6,
    backgroundColor: '#f9fafb',
  },
  paymentCardSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#f0f9ff',
  },
  paymentCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  paymentInfo: {
    flex: 1,
  },
  paymentName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 4,
  },
  paymentNameDisabled: {
    color: '#9ca3af',
  },
  paymentDescription: {
    fontSize: 14,
    color: '#6b7280',
  },
  paymentDescriptionDisabled: {
    color: '#9ca3af',
  },
  disabledBadge: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  disabledBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  selectedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  form: {
    gap: 24,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'flex-start',
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1e40af',
    lineHeight: 20,
  },
  bottomActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  backButtonAction: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  submitButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#3b82f6',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  submitButtonDisabled: {
    opacity: 0.7,
    backgroundColor: '#9ca3af',
  },
});
