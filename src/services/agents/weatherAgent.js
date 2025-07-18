const { Tool } = require('langchain/tools');
const axios = require('axios');
const logger = require('../../utils/logger');

class WeatherAgent {
  constructor() {
    this.agentName = 'weather';
    this.tools = this.createTools();
    this.apiKey = process.env.OPENWEATHER_API_KEY;
    this.baseUrl = 'https://api.openweathermap.org/data/2.5';
  }

  createTools() {
    return [
      new Tool({
        name: 'get_current_weather',
        description: 'Get current weather for a location',
        func: async (input) => {
          try {
            const { location } = JSON.parse(input);
            return await this.getCurrentWeather(location);
          } catch (error) {
            logger.error('Get current weather tool error:', error);
            return `Error getting current weather: ${error.message}`;
          }
        }
      }),
      new Tool({
        name: 'get_weather_forecast',
        description: 'Get weather forecast for a location',
        func: async (input) => {
          try {
            const { location, days } = JSON.parse(input);
            return await this.getWeatherForecast(location, days);
          } catch (error) {
            logger.error('Get weather forecast tool error:', error);
            return `Error getting weather forecast: ${error.message}`;
          }
        }
      }),
      new Tool({
        name: 'get_weather_alerts',
        description: 'Get weather alerts for a location',
        func: async (input) => {
          try {
            const { location } = JSON.parse(input);
            return await this.getWeatherAlerts(location);
          } catch (error) {
            logger.error('Get weather alerts tool error:', error);
            return `Error getting weather alerts: ${error.message}`;
          }
        }
      })
    ];
  }

  async processCommand(userId, input, context = {}) {
    try {
      logger.info(`Weather agent processing command for user ${userId}:`, {
        input: input.substring(0, 100)
      });

      // Parse the intent and extract relevant information
      const intent = await this.parseWeatherIntent(input);
      
      let response;
      switch (intent.type) {
        case 'current_weather':
          response = await this.handleCurrentWeather(userId, intent, context);
          break;
        case 'weather_forecast':
          response = await this.handleWeatherForecast(userId, intent, context);
          break;
        case 'weather_alerts':
          response = await this.handleWeatherAlerts(userId, intent, context);
          break;
        case 'weather_comparison':
          response = await this.handleWeatherComparison(userId, intent, context);
          break;
        default:
          response = await this.handleGeneralWeatherQuery(userId, input, context);
      }

      logger.info(`Weather agent completed processing for user ${userId}`);
      return response;
    } catch (error) {
      logger.error('Weather agent processing failed:', error);
      return {
        text: "I'm having trouble getting weather information. Could you please try again?",
        actions: [],
        suggestions: ['Check current weather', 'Get weather forecast', 'Ask about different location']
      };
    }
  }

  async parseWeatherIntent(input) {
    const lowerInput = input.toLowerCase();
    
    // Current weather patterns
    if (lowerInput.includes('current') || lowerInput.includes('now') || lowerInput.includes('today')) {
      const location = this.extractLocation(input);
      return { type: 'current_weather', location };
    }
    
    // Weather forecast patterns
    if (lowerInput.includes('forecast') || lowerInput.includes('tomorrow') || 
        lowerInput.includes('week') || lowerInput.includes('days')) {
      const location = this.extractLocation(input);
      const days = this.extractDays(input);
      return { type: 'weather_forecast', location, days };
    }
    
    // Weather alerts patterns
    if (lowerInput.includes('alert') || lowerInput.includes('warning') || 
        lowerInput.includes('severe') || lowerInput.includes('storm')) {
      const location = this.extractLocation(input);
      return { type: 'weather_alerts', location };
    }
    
    // Weather comparison patterns
    if (lowerInput.includes('compare') || lowerInput.includes('versus') || lowerInput.includes('vs')) {
      return { type: 'weather_comparison', input };
    }
    
    // Default to current weather
    const location = this.extractLocation(input);
    return { type: 'current_weather', location };
  }

  async handleCurrentWeather(userId, intent, context) {
    try {
      const location = intent.location || context.userLocation || 'New York';
      const weather = await this.getCurrentWeather(location);
      
      if (!weather) {
        return {
          text: `I couldn't get weather information for ${location}. Please try a different location.`,
          actions: [],
          suggestions: ['Try different location', 'Check forecast', 'Get weather alerts']
        };
      }
      
      const responseText = `Current weather in ${weather.location}: ${weather.temperature}°F, ${weather.description}. ` +
                          `Feels like ${weather.feelsLike}°F. Humidity: ${weather.humidity}%. ` +
                          `Wind: ${weather.windSpeed} mph.`;
      
      return {
        text: responseText,
        actions: [{
          type: 'view_detailed_weather',
          location: weather.location,
          temperature: weather.temperature
        }],
        suggestions: ['Get forecast', 'Check different location', 'Weather alerts']
      };
    } catch (error) {
      logger.error('Handle current weather failed:', error);
      return {
        text: "I couldn't get the current weather. Please try again.",
        actions: [],
        suggestions: ['Try again', 'Check different location']
      };
    }
  }

  async handleWeatherForecast(userId, intent, context) {
    try {
      const location = intent.location || context.userLocation || 'New York';
      const days = intent.days || 5;
      const forecast = await this.getWeatherForecast(location, days);
      
      if (!forecast || forecast.length === 0) {
        return {
          text: `I couldn't get weather forecast for ${location}. Please try a different location.`,
          actions: [],
          suggestions: ['Try different location', 'Check current weather', 'Get weather alerts']
        };
      }
      
      const forecastText = forecast.map(day => 
        `${day.day}: ${day.high}°/${day.low}°F, ${day.description}`
      ).join('. ');
      
      const responseText = `Weather forecast for ${location}: ${forecastText}`;
      
      return {
        text: responseText,
        actions: forecast.map(day => ({
          type: 'view_day_weather',
          date: day.date,
          location: location
        })),
        suggestions: ['Current weather', 'Extended forecast', 'Weather alerts']
      };
    } catch (error) {
      logger.error('Handle weather forecast failed:', error);
      return {
        text: "I couldn't get the weather forecast. Please try again.",
        actions: [],
        suggestions: ['Try again', 'Check current weather']
      };
    }
  }

  async handleWeatherAlerts(userId, intent, context) {
    try {
      const location = intent.location || context.userLocation || 'New York';
      const alerts = await this.getWeatherAlerts(location);
      
      if (!alerts || alerts.length === 0) {
        return {
          text: `No weather alerts for ${location}. The weather conditions are normal.`,
          actions: [],
          suggestions: ['Check current weather', 'Get forecast', 'Check different location']
        };
      }
      
      const alertText = alerts.map(alert => 
        `${alert.severity}: ${alert.title} - ${alert.description}`
      ).join('. ');
      
      const responseText = `Weather alerts for ${location}: ${alertText}`;
      
      return {
        text: responseText,
        actions: alerts.map(alert => ({
          type: 'view_weather_alert',
          alertId: alert.id,
          severity: alert.severity
        })),
        suggestions: ['Current weather', 'Get forecast', 'Safety tips']
      };
    } catch (error) {
      logger.error('Handle weather alerts failed:', error);
      return {
        text: "I couldn't get weather alerts. Please try again.",
        actions: [],
        suggestions: ['Try again', 'Check current weather']
      };
    }
  }

  async handleWeatherComparison(userId, intent, context) {
    try {
      return {
        text: "Weather comparison is not yet implemented. Please ask about weather for a specific location.",
        actions: [],
        suggestions: ['Current weather', 'Weather forecast', 'Weather alerts']
      };
    } catch (error) {
      logger.error('Handle weather comparison failed:', error);
      return {
        text: "I couldn't compare weather. Please try again.",
        actions: [],
        suggestions: ['Current weather', 'Weather forecast']
      };
    }
  }

  async handleGeneralWeatherQuery(userId, input, context) {
    return {
      text: "I can help you with weather information. You can ask about current weather, forecasts, or weather alerts for any location.",
      actions: [],
      suggestions: ['Current weather', 'Weather forecast', 'Weather alerts']
    };
  }

  // Weather data methods
  async getCurrentWeather(location) {
    try {
      if (!this.apiKey) {
        // Return mock data if no API key
        return this.getMockCurrentWeather(location);
      }
      
      const response = await axios.get(`${this.baseUrl}/weather`, {
        params: {
          q: location,
          appid: this.apiKey,
          units: 'imperial'
        }
      });
      
      const data = response.data;
      
      return {
        location: data.name,
        temperature: Math.round(data.main.temp),
        feelsLike: Math.round(data.main.feels_like),
        description: data.weather[0].description,
        humidity: data.main.humidity,
        windSpeed: Math.round(data.wind.speed),
        pressure: data.main.pressure,
        visibility: data.visibility,
        uvIndex: null, // Not available in current weather endpoint
        icon: data.weather[0].icon
      };
    } catch (error) {
      logger.error('Get current weather failed:', error);
      return this.getMockCurrentWeather(location);
    }
  }

  async getWeatherForecast(location, days = 5) {
    try {
      if (!this.apiKey) {
        // Return mock data if no API key
        return this.getMockWeatherForecast(location, days);
      }
      
      const response = await axios.get(`${this.baseUrl}/forecast`, {
        params: {
          q: location,
          appid: this.apiKey,
          units: 'imperial',
          cnt: days * 8 // 8 forecasts per day (every 3 hours)
        }
      });
      
      const data = response.data;
      const dailyForecasts = [];
      
      // Group forecasts by day
      const grouped = {};
      data.list.forEach(item => {
        const date = new Date(item.dt * 1000);
        const dayKey = date.toDateString();
        
        if (!grouped[dayKey]) {
          grouped[dayKey] = {
            date: date,
            temps: [],
            descriptions: [],
            icons: []
          };
        }
        
        grouped[dayKey].temps.push(item.main.temp);
        grouped[dayKey].descriptions.push(item.weather[0].description);
        grouped[dayKey].icons.push(item.weather[0].icon);
      });
      
      // Create daily summaries
      Object.keys(grouped).slice(0, days).forEach(dayKey => {
        const dayData = grouped[dayKey];
        const high = Math.round(Math.max(...dayData.temps));
        const low = Math.round(Math.min(...dayData.temps));
        const mostCommonDescription = this.getMostCommon(dayData.descriptions);
        
        dailyForecasts.push({
          date: dayData.date,
          day: dayData.date.toLocaleDateString('en-US', { weekday: 'long' }),
          high,
          low,
          description: mostCommonDescription,
          icon: dayData.icons[0]
        });
      });
      
      return dailyForecasts;
    } catch (error) {
      logger.error('Get weather forecast failed:', error);
      return this.getMockWeatherForecast(location, days);
    }
  }

  async getWeatherAlerts(location) {
    try {
      // OpenWeatherMap alerts require a different endpoint and paid plan
      // For now, return mock data
      return this.getMockWeatherAlerts(location);
    } catch (error) {
      logger.error('Get weather alerts failed:', error);
      return [];
    }
  }

  // Mock data methods for development/testing
  getMockCurrentWeather(location) {
    const mockWeather = {
      'New York': { temp: 72, desc: 'partly cloudy', humidity: 65, wind: 8 },
      'London': { temp: 59, desc: 'light rain', humidity: 80, wind: 12 },
      'Tokyo': { temp: 77, desc: 'clear sky', humidity: 55, wind: 5 },
      'Sydney': { temp: 68, desc: 'scattered clouds', humidity: 70, wind: 10 }
    };
    
    const data = mockWeather[location] || mockWeather['New York'];
    
    return {
      location: location,
      temperature: data.temp,
      feelsLike: data.temp + 2,
      description: data.desc,
      humidity: data.humidity,
      windSpeed: data.wind,
      pressure: 1013,
      visibility: 10,
      uvIndex: 3,
      icon: '01d'
    };
  }

  getMockWeatherForecast(location, days) {
    const baseTemp = this.getMockCurrentWeather(location).temperature;
    const forecast = [];
    
    const descriptions = ['sunny', 'partly cloudy', 'cloudy', 'light rain', 'clear sky'];
    
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      
      const tempVariation = Math.random() * 10 - 5; // ±5 degrees
      const high = Math.round(baseTemp + tempVariation + 5);
      const low = Math.round(baseTemp + tempVariation - 5);
      
      forecast.push({
        date: date,
        day: date.toLocaleDateString('en-US', { weekday: 'long' }),
        high,
        low,
        description: descriptions[Math.floor(Math.random() * descriptions.length)],
        icon: '01d'
      });
    }
    
    return forecast;
  }

  getMockWeatherAlerts(location) {
    // Return empty array for most locations (no alerts)
    const alertLocations = ['Miami', 'New Orleans', 'Houston'];
    
    if (alertLocations.includes(location)) {
      return [{
        id: 'alert1',
        severity: 'Minor',
        title: 'Heat Advisory',
        description: 'High temperatures expected. Stay hydrated and avoid prolonged sun exposure.',
        startTime: new Date(),
        endTime: new Date(Date.now() + 6 * 60 * 60 * 1000) // 6 hours from now
      }];
    }
    
    return [];
  }

  // Utility methods
  extractLocation(input) {
    // Simple location extraction - in a real implementation, this would use NLP
    const locationPatterns = [
      /in ([A-Za-z\s]+)/i,
      /for ([A-Za-z\s]+)/i,
      /at ([A-Za-z\s]+)/i,
      /([A-Za-z\s]+) weather/i
    ];
    
    for (const pattern of locationPatterns) {
      const match = input.match(pattern);
      if (match) {
        const location = match[1].trim();
        // Filter out common words that aren't locations
        const excludeWords = ['the', 'weather', 'current', 'today', 'tomorrow', 'forecast'];
        if (!excludeWords.includes(location.toLowerCase())) {
          return location;
        }
      }
    }
    
    return null;
  }

  extractDays(input) {
    const dayPatterns = [
      /(\d+) days?/i,
      /next (\d+) days?/i,
      /(\d+) day forecast/i
    ];
    
    for (const pattern of dayPatterns) {
      const match = input.match(pattern);
      if (match) {
        const days = parseInt(match[1]);
        return Math.min(days, 7); // Limit to 7 days
      }
    }
    
    if (input.includes('tomorrow')) return 1;
    if (input.includes('week')) return 7;
    
    return 5; // Default to 5 days
  }

  getMostCommon(array) {
    const counts = {};
    let maxCount = 0;
    let mostCommon = array[0];
    
    array.forEach(item => {
      counts[item] = (counts[item] || 0) + 1;
      if (counts[item] > maxCount) {
        maxCount = counts[item];
        mostCommon = item;
      }
    });
    
    return mostCommon;
  }

  convertToFahrenheit(celsius) {
    return Math.round((celsius * 9/5) + 32);
  }

  convertToCelsius(fahrenheit) {
    return Math.round((fahrenheit - 32) * 5/9);
  }

  getWindDirection(degrees) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 
                       'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
  }

  formatWeatherIcon(iconCode) {
    const iconMap = {
      '01d': '☀️', '01n': '🌙',
      '02d': '⛅', '02n': '⛅',
      '03d': '☁️', '03n': '☁️',
      '04d': '☁️', '04n': '☁️',
      '09d': '🌧️', '09n': '🌧️',
      '10d': '🌦️', '10n': '🌦️',
      '11d': '⛈️', '11n': '⛈️',
      '13d': '❄️', '13n': '❄️',
      '50d': '🌫️', '50n': '🌫️'
    };
    
    return iconMap[iconCode] || '🌤️';
  }

  getStats() {
    return {
      agentName: this.agentName,
      toolsAvailable: this.tools.length,
      apiKeyConfigured: !!this.apiKey,
      lastProcessedAt: new Date().toISOString()
    };
  }
}

module.exports = new WeatherAgent();