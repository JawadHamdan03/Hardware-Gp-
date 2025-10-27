// Charts Management for Smart Warehouse
class ChartsManager {
    constructor() {
        this.inventoryChart = null;
        this.distributionChart = null;
        this.initializeCharts();
    }

    initializeCharts() {
        this.createInventoryChart();
        this.createDistributionChart();
    }

    createInventoryChart() {
        const ctx = document.getElementById('inventoryChart');
        if (!ctx) return;

        // Sample data for inventory movement
        const labels = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
        const data = {
            labels: labels,
            datasets: [{
                label: 'منتجات مخزنة',
                data: [65, 59, 80, 81, 56, 55, 40],
                borderColor: '#4361ee',
                backgroundColor: 'rgba(67, 97, 238, 0.1)',
                tension: 0.4,
                fill: true
            }, {
                label: 'منتجات مسترجعة',
                data: [28, 48, 40, 19, 86, 27, 90],
                borderColor: '#f72585',
                backgroundColor: 'rgba(247, 37, 133, 0.1)',
                tension: 0.4,
                fill: true
            }]
        };

        const config = {
            type: 'line',
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'حركة المخزون الأسبوعية'
                    },
                    legend: {
                        display: true,
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            font: {
                                family: 'Tajawal'
                            }
                        }
                    },
                    x: {
                        ticks: {
                            font: {
                                family: 'Tajawal'
                            }
                        }
                    }
                }
            }
        };

        this.inventoryChart = new Chart(ctx, config);
    }

    createDistributionChart() {
        const ctx = document.getElementById('distributionChart');
        if (!ctx) return;

        const data = {
            labels: ['إلكترونيات', 'ميكانيكية', 'أدوات', 'مواد خام', 'أخرى'],
            datasets: [{
                data: [35, 25, 20, 15, 5],
                backgroundColor: [
                    '#4361ee',
                    '#7209b7',
                    '#4cc9f0',
                    '#f72585',
                    '#e63946'
                ],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        };

        const config = {
            type: 'doughnut',
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'توزيع المنتجات حسب الفئة'
                    },
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: {
                            font: {
                                family: 'Tajawal'
                            }
                        }
                    }
                }
            }
        };

        this.distributionChart = new Chart(ctx, config);
    }

    updateInventoryChart(newData) {
        if (this.inventoryChart) {
            this.inventoryChart.data.datasets[0].data = newData.stored;
            this.inventoryChart.data.datasets[1].data = newData.retrieved;
            this.inventoryChart.update();
        }
    }

    updateDistributionChart(newData) {
        if (this.distributionChart) {
            this.distributionChart.data.datasets[0].data = newData;
            this.distributionChart.update();
        }
    }

    destroy() {
        if (this.inventoryChart) {
            this.inventoryChart.destroy();
        }
        if (this.distributionChart) {
            this.distributionChart.destroy();
        }
    }
}

// Initialize charts when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    window.chartsManager = new ChartsManager();
});
